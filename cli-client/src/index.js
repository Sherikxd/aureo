#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import WebSocket from 'ws';

const program = new Command();

function requireUrl(value, name) {
  if (!value) throw new Error(`Configura ${name} o proporciona --url.`);
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`URL inválida: ${value}`);
  }
}

function createAbortSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

function printPayload(payload, format) {
  if (format === 'json') {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const verdict = payload.verdict;
  if (payload.type === 'risk_verdict' && verdict) {
    console.log(
      `[${verdict.nivel_riesgo.toUpperCase()}] ${verdict.motivo}` +
        (verdict.requiere_mfa ? ' (MFA requerida)' : ''),
    );
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: createAbortSignal(options.timeout ?? 15_000),
  });
  const body = await response.text();
  let payload;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`Backend devolvió una respuesta no válida (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = payload?.error ?? body.trim();
    throw new Error(`Backend respondió HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
  }
  return payload;
}

program
  .name('aureo')
  .description('Cliente CLI de observabilidad y compliance Web3')
  .version('0.1.0');

program
  .command('status')
  .description('Comprueba la disponibilidad del backend y su wallet')
  .option('-u, --url <url>', 'API del backend', process.env.AUREO_BACKEND_URL)
  .option('--json', 'Imprime la respuesta completa en JSON')
  .option('--metrics', 'Muestra las métricas Prometheus resumidas')
  .action(async (options) => {
    const url = requireUrl(options.url, 'AUREO_BACKEND_URL').replace(/\/$/, '');
    try {
      const [health, wallet] = await Promise.all([
        fetchJson(`${url}/health`),
        fetchJson(`${url}/wallet`),
      ]);
      const result = { status: 'ok', backend: url, health, wallet };
      if (options.metrics) {
        result.metrics = await fetch(`${url}/metrics`).then((response) => response.text());
      }
      if (options.json) printPayload(result, 'json');
      else {
        console.log(`Backend: ${url}`);
        console.log(`Estado: ${health?.status ?? 'desconocido'}`);
        console.log(`Wallet: ${wallet?.configured ? wallet.address : 'no configurada'}`);
        if (options.metrics) console.log(result.metrics);
      }
    } catch (error) {
      console.error(`No se pudo comprobar el backend: ${error.message}`);
      process.exitCode = 1;
    }
  });

program
  .command('stream')
  .description('Muestra en tiempo real los veredictos de riesgo')
  .option('-u, --url <url>', 'WebSocket del backend', process.env.AUREO_STREAM_URL)
  .option('-f, --format <format>', 'Formato de salida: json o pretty', 'json')
  .option('--no-mfa-prompt', 'No solicitar MFA de forma interactiva')
  .option('--metrics', 'Muestra un resumen de veredictos recibidos')
  .action((options) => {
    const url = requireUrl(options.url, 'AUREO_STREAM_URL');
    if (!['json', 'pretty'].includes(options.format)) {
      throw new Error('--format debe ser json o pretty.');
    }
    const socket = new WebSocket(url);
    let mfaPromptActive = false;
    let shuttingDown = false;
    const counts = { total: 0, byRisk: {} };
    socket.on('open', () => {
      console.log(`Conectado a ${url}. Ctrl+C para salir.`);
      console.log(
        `Umbrales activos: velocidad=${process.env.SPEED_THRESHOLD ?? 3} operaciones, ` +
          `ventana=${process.env.SPEED_BLOCK_WINDOW ?? 4} bloques, ` +
          `volumen=${process.env.VOLUME_MULTIPLIER ?? 3}x`,
      );
    });
    socket.on('message', async (message) => {
      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch {
        console.error('Se recibió un mensaje inválido del stream; se ignora.');
        return;
      }
      printPayload(payload, options.format);
      if (options.metrics && payload.verdict) {
        counts.total += 1;
        const risk = payload.verdict.nivel_riesgo ?? 'desconocido';
        counts.byRisk[risk] = (counts.byRisk[risk] ?? 0) + 1;
        console.log(`Métricas: total=${counts.total} riesgo=${JSON.stringify(counts.byRisk)}`);
      }
      if (!options.mfaPrompt || !payload.verdict?.requiere_mfa || mfaPromptActive) return;
      mfaPromptActive = true;
      const readline = createInterface({ input, output });
      try {
        const token = await readline.question('MFA requerida. Introduce tu código MFA: ');
        if (!token.trim()) console.error('MFA no proporcionada; la operación permanece pendiente.');
        else console.log('MFA recibida; requiere validación por el proveedor de identidad.');
      } finally {
        readline.close();
        mfaPromptActive = false;
      }
    });
    socket.on('error', (error) => {
      console.error(`Error del stream: ${error.message}`);
      process.exitCode = 1;
    });
    socket.on('close', (code, reason) => {
      if (!shuttingDown) {
        console.error(`Stream desconectado (código ${code}${reason ? `: ${reason}` : ''}).`);
        process.exitCode = 1;
      }
    });
    const shutdown = () => {
      shuttingDown = true;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
        socket.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });

program
  .command('report')
  .description('Consulta un reporte de auditoría en lenguaje natural')
  .argument('<query>', 'Pregunta para el reporte')
  .option('-u, --url <url>', 'API del backend', process.env.AUREO_BACKEND_URL)
  .option('-f, --format <format>', 'Formato de salida: json o pretty', 'json')
  .option('--filter <value>', 'Filtro risk:<nivel> o mfa:<true|false>')
  .option('--since <date>', 'Fecha ISO inicial')
  .option('--page <number>', 'Página', '1')
  .option('--size <number>', 'Tamaño de página', '20')
  .option('--export <format>', 'Exporta como csv')
  .action(async (query, options) => {
    const url = requireUrl(options.url, 'AUREO_BACKEND_URL').replace(/\/$/, '');
    if (!query.trim()) throw new Error('La consulta no puede estar vacía.');
    if (!['json', 'pretty'].includes(options.format)) {
      throw new Error('--format debe ser json o pretty.');
    }
    try {
      const payload = await fetchJson(`${url}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          filters: {
            ...(options.filter?.startsWith('risk:')
              ? { risk_level: options.filter.slice(5) }
              : {}),
            ...(options.filter?.startsWith('mfa:')
              ? { mfa: options.filter.slice(4) === 'true' }
              : {}),
            ...(options.since ? { from: options.since } : {}),
            page: Number(options.page),
            pageSize: Number(options.size),
          },
        }),
      });
      if (options.export === 'csv') {
        console.log('receivedAt,nivel_riesgo,requiere_mfa,bloquear_contrato,motivo');
        for (const item of payload.verdicts ?? []) {
          const verdict = item.verdict ?? {};
          console.log([
            item.receivedAt,
            verdict.nivel_riesgo,
            verdict.requiere_mfa,
            verdict.bloquear_contrato,
            JSON.stringify(verdict.motivo ?? ''),
          ].join(','));
        }
        return;
      }
      if (options.format === 'pretty') {
        console.log(`Consulta: ${payload.query}`);
        console.log(`Página ${payload.page} de ${payload.totalPages} · total=${payload.total}`);
        console.log(`Veredictos recibidos: ${payload.verdicts?.length ?? 0}`);
        for (const item of payload.verdicts ?? []) printPayload(item, 'pretty');
      } else printPayload(payload, 'json');
    } catch (error) {
      const message = error.name === 'TimeoutError' ? 'tiempo de espera agotado' : error.message;
      console.error(`No se pudo obtener el reporte: ${message}`);
      process.exitCode = 1;
    }
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
