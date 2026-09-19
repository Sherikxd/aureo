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

program
  .name('aureo')
  .description('Cliente CLI de observabilidad y compliance Web3')
  .version('0.1.0');

program
  .command('stream')
  .description('Muestra en tiempo real los veredictos de riesgo')
  .option('-u, --url <url>', 'WebSocket del backend', process.env.AUREO_STREAM_URL)
  .action((options) => {
    const url = requireUrl(options.url, 'AUREO_STREAM_URL');
    const socket = new WebSocket(url);
    let mfaPromptActive = false;
    let shuttingDown = false;
    socket.on('open', () => console.log(`Conectado a ${url}. Ctrl+C para salir.`));
    socket.on('message', async (message) => {
      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch {
        console.error('Se recibió un mensaje inválido del stream; se ignora.');
        return;
      }
      console.log(JSON.stringify(payload, null, 2));
      if (!payload.verdict?.requiere_mfa || mfaPromptActive) return;
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
  .action(async (query, options) => {
    const url = requireUrl(options.url, 'AUREO_BACKEND_URL').replace(/\/$/, '');
    if (!query.trim()) throw new Error('La consulta no puede estar vacía.');
    try {
      const response = await fetch(`${url}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: createAbortSignal(15_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(
          `Backend respondió HTTP ${response.status}${detail ? `: ${detail}` : '.'}`,
        );
      }
      console.log(JSON.stringify(await response.json(), null, 2));
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
