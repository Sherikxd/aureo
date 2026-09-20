import 'dotenv/config';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { ethers } from 'ethers';
import { WebSocketServer } from 'ws';
import { createAnalyzer } from './analyzer.js';
import { loadState, saveState } from './state.js';
import { createEthWallet } from './wallet.js';

const ABI = [
  'event CorporateTransferRecorded(uint256 indexed operationId,address indexed initiator,address indexed beneficiary,uint256 amount,bytes32 operationReference,uint256 timestamp)',
  'event AlertStarted(uint256 indexed alertId,bytes32 indexed operationReference,uint8 riskLevel,string reason,uint256 timestamp)',
];

const windowMs = parseInterval(process.env.BACKEND_WINDOW_MS ?? '60000');
const maxBodyBytes = 1_048_576;
const maxBufferedEvents = 10_000;
const maxVerdicts = 100;
const pollIntervalMs = 5_000;
const confirmations = parseNonNegativeInteger(process.env.BLOCKCHAIN_CONFIRMATIONS, 0);
const maxBlockRange = parsePositiveInteger(process.env.BLOCKCHAIN_MAX_BLOCK_RANGE, 2_000);
const stateFile = resolve(process.env.BACKEND_STATE_FILE ?? '.runtime/backend-state.json');
const streamClients = new Set();
const alertWebhookUrls = (process.env.ALERT_WEBHOOK_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const integrationMetrics = {
  verdictsTotal: 0,
  verdictsByRisk: { bajo: 0, medio: 0, alto: 0, critico: 0 },
  llmCalls: 0,
  llmSuccess: 0,
  llmErrors: 0,
  eventsProcessed: 0,
  eventsDiscarded: 0,
  windowAnalyses: 0,
};

/**
 * Starts the WebSocket event ingestion and periodic risk analysis.
 */
export async function start() {
  const wsUrl = process.env.BLOCKCHAIN_WS_URL ?? 'ws://127.0.0.1:8545';
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL ?? wsUrl.replace(/^ws/, 'http');
  const address = process.env.AUREO_CORE_ADDRESS;
  if (!address) throw new Error('AUREO_CORE_ADDRESS es obligatorio.');

  const state = loadState(stateFile);
  const events = state.events;
  const historicalAmounts = new Map(
    Object.entries(state.historicalAmounts).map(([key, values]) => [key, values]),
  );
  const verdicts = state.verdicts;
  let lastScannedBlock = state.lastScannedBlock;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(address, ABI, provider);
  const ethWallet = createEthWallet(provider);
  const signedContract = ethWallet ? contract.connect(ethWallet.wallet) : null;
  const analyzer = createAnalyzer({
    onMetric: (name) => {
      if (name === 'llm_call') integrationMetrics.llmCalls += 1;
      if (name === 'llm_success') integrationMetrics.llmSuccess += 1;
      if (name === 'llm_error') integrationMetrics.llmErrors += 1;
    },
  });
  const httpServer = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        wallet: ethWallet
          ? { configured: true, address: ethWallet.address }
          : { configured: false },
      });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/wallet') {
      sendJson(response, 200, {
        configured: Boolean(ethWallet),
        address: ethWallet?.address ?? null,
        signerReady: Boolean(signedContract),
      });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/metrics') {
      response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
      response.end(formatPrometheusMetrics(integrationMetrics));
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/reports') {
      try {
        const payload = JSON.parse(await readRequestBody(request));
        if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) {
          throw new Error('query debe ser un texto no vacío.');
        }
        const result = paginateVerdicts(verdicts, payload.filters ?? {});
        sendJson(response, 200, { query: payload.query.trim(), ...result });
      } catch (error) {
        sendJson(response, error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
          error: error.message,
        });
      }
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const webSocketServer = new WebSocketServer({ server: httpServer, path: '/stream' });
  webSocketServer.on('connection', (socket) => {
    streamClients.add(socket);
    socket.on('error', () => streamClients.delete(socket));
    socket.on('close', () => streamClients.delete(socket));
    for (const verdict of verdicts) socket.send(JSON.stringify(verdict));
  });
  const port = parsePort(process.env.BACKEND_PORT ?? '3000');
  httpServer.listen(port, '0.0.0.0', () => console.log(`API Áureo escuchando en ${port}`));

  const transferTopic = contract.interface.getEvent('CorporateTransferRecorded').topicHash;
  let polling = false;
  const pollTimer = setInterval(() => pollEvents().catch((error) => console.error(error)), pollIntervalMs);
  await pollEvents();

  let processingWindow = false;
  const windowTimer = setInterval(async () => {
    if (processingWindow) return;
    if (!events.length) return;
    processingWindow = true;
    const window = events.splice(0, events.length);
    let windowAnalyzed = false;
    try {
      const verdict = await analyzer.analyzeWindow(window, {
        historicalAmounts,
        operationalReserve: process.env.OPERATIONAL_RESERVE || undefined,
      });
      integrationMetrics.windowAnalyses += 1;
      windowAnalyzed = true;
      const message = { type: 'risk_verdict', verdict, receivedAt: new Date().toISOString() };
      verdicts.push(message);
      integrationMetrics.verdictsTotal += 1;
      if (integrationMetrics.verdictsByRisk[verdict.nivel_riesgo] !== undefined) {
        integrationMetrics.verdictsByRisk[verdict.nivel_riesgo] += 1;
      }
      integrationMetrics.eventsProcessed += window.length;
      if (verdicts.length > maxVerdicts) verdicts.shift();
      const serialized = JSON.stringify(message);
      if (['alto', 'critico'].includes(verdict.nivel_riesgo)) {
        await notifyAlertWebhooks(verdict);
      }
      for (const client of streamClients) {
        if (client.readyState === 1) {
          try {
            client.send(serialized);
          } catch (error) {
            console.error('No se pudo publicar el veredicto en el stream:', error);
            client.close();
          }
        }
      }
      console.log(serialized);
      for (const event of window) {
        const key = event.initiator.toLowerCase();
        const history = historicalAmounts.get(key) ?? [];
        history.push(event.amount);
        historicalAmounts.set(key, history.slice(-100));
      }
      persistState();
    } catch (error) {
      if (!windowAnalyzed) {
        events.unshift(...window);
        if (events.length > maxBufferedEvents) {
          events.splice(maxBufferedEvents);
        }
        persistState();
      }
      console.error(error);
    } finally {
      processingWindow = false;
    }
  }, windowMs);

  console.log(`Áureo recuperando eventos desde ${rpcUrl}`);
  console.log(
    ethWallet
      ? `Wallet Ethereum operativa: ${ethWallet.address}`
      : 'Wallet Ethereum no configurada; backend en modo solo lectura.',
  );

  const shutdown = async (signal) => {
    clearInterval(windowTimer);
    clearInterval(pollTimer);
    for (const client of streamClients) client.close();
    await new Promise((resolve) => webSocketServer.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
    provider.destroy();
    console.log(`Áureo detenido (${signal}).`);
  };

  process.once('SIGINT', () => shutdown('SIGINT').catch(console.error));
  process.once('SIGTERM', () => shutdown('SIGTERM').catch(console.error));

  return { httpServer, provider, shutdown };

  async function pollEvents() {
    if (polling) return;
    polling = true;
    try {
      const latestBlock = await provider.getBlockNumber();
      const confirmedBlock = latestBlock - confirmations;
      if (confirmedBlock < 0) return;
      const fromBlock = Math.max(lastScannedBlock + 1, 0);
      const toBlock = Math.min(confirmedBlock, fromBlock + maxBlockRange - 1);
      if (fromBlock <= toBlock) {
        const logs = await provider.getLogs({
          address,
          topics: [transferTopic],
          fromBlock,
          toBlock,
        });
        for (const log of logs) {
          const parsed = contract.interface.parseLog(log);
          if (!parsed) continue;
          const eventKey = `${log.transactionHash}:${log.index}`;
          if (events.some((item) => item.eventKey === eventKey)) {
            integrationMetrics.eventsDiscarded += 1;
            continue;
          }
          events.push({
            eventKey,
            type: 'CorporateTransferRecorded',
            operationId: parsed.args[0].toString(),
            initiator: parsed.args[1],
            beneficiary: parsed.args[2],
            amount: parsed.args[3].toString(),
            operationReference: parsed.args[4],
            blockNumber: log.blockNumber,
          });
        }
        lastScannedBlock = toBlock;
        persistState();
      }
    } finally {
      polling = false;
    }
  }

  function persistState() {
    saveState(stateFile, {
      lastScannedBlock,
      events,
      historicalAmounts: Object.fromEntries(historicalAmounts),
      verdicts,
    });
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        const error = new Error('El cuerpo de la solicitud es demasiado grande.');
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
    request.on('aborted', () => reject(new Error('La solicitud fue cancelada.')));
  });
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('BACKEND_PORT debe ser un puerto entero entre 1 y 65535.');
  }
  return port;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatPrometheusMetrics(metrics) {
  return [
    '# HELP verdicts_total Total de veredictos publicados.',
    '# TYPE verdicts_total counter',
    `verdicts_total ${metrics.verdictsTotal}`,
    '# TYPE verdicts_by_risk gauge',
    ...Object.entries(metrics.verdictsByRisk).map(([risk, value]) => `verdicts_by_risk{risk="${risk}"} ${value}`),
    '# TYPE llm_calls_total counter',
    `llm_calls_total ${metrics.llmCalls}`,
    '# TYPE llm_success_total counter',
    `llm_success_total ${metrics.llmSuccess}`,
    '# TYPE llm_errors_total counter',
    `llm_errors_total ${metrics.llmErrors}`,
    '# TYPE events_processed_total counter',
    `events_processed_total ${metrics.eventsProcessed}`,
    '# TYPE events_discarded_total counter',
    `events_discarded_total ${metrics.eventsDiscarded}`,
    '# TYPE window_analyses_total counter',
    `window_analyses_total ${metrics.windowAnalyses}`,
    '',
  ].join('\n');
}

async function notifyAlertWebhooks(verdict) {
  const payload = JSON.stringify({
    nivel_riesgo: verdict.nivel_riesgo,
    motivo: verdict.motivo,
    timestamp: new Date().toISOString(),
  });
  await Promise.all(
    alertWebhookUrls.map(async (url) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: payload,
            signal: AbortSignal.timeout(5_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return;
        } catch (error) {
          if (attempt === 2) {
            console.error(`Webhook de alerta falló (${url}): ${error.message}`);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
          }
        }
      }
    }),
  );
}

function paginateVerdicts(items, filters) {
  const page = parsePositiveInteger(filters.page, 1);
  const pageSize = Math.min(parsePositiveInteger(filters.pageSize, 20), 100);
  const filtered = items.filter((item) => {
    const verdict = item.verdict ?? {};
    if (filters.risk_level && verdict.nivel_riesgo !== filters.risk_level) return false;
    if (filters.mfa !== undefined && Boolean(verdict.requiere_mfa) !== Boolean(filters.mfa)) return false;
    if (filters.from && item.receivedAt < filters.from) return false;
    if (filters.to && item.receivedAt > filters.to) return false;
    if (filters.initiator && !JSON.stringify(verdict).toLowerCase().includes(String(filters.initiator).toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  return {
    verdicts: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: filtered.length,
    totalPages,
  };
}

function parseInterval(value) {
  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < 1_000) {
    throw new Error('BACKEND_WINDOW_MS debe ser un entero de al menos 1000 ms.');
  }
  return interval;
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
