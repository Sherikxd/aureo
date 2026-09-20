import 'dotenv/config';
import WebSocket from 'ws';
import { createMetrics } from '@aureo/sdk';

const backendUrl = (process.env.AUREO_BACKEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const streamUrl = process.env.AUREO_STREAM_URL ?? 'ws://127.0.0.1:3000/stream';
const refreshMs = parseInterval(process.env.METRICS_REFRESH_MS ?? '5000');
const output = process.env.METRICS_OUTPUT ?? 'pretty';

if (!['pretty', 'json'].includes(output)) {
  throw new Error('METRICS_OUTPUT debe ser pretty o json.');
}

const metrics = {
  startedAt: new Date().toISOString(),
  backend: { connected: false, status: 'unknown', walletConfigured: false },
  stream: { connected: false, reconnects: 0, lastMessageAt: null },
  errors: 0,
};
const sdkMetrics = createMetrics();
let shuttingDown = false;
let socket;
let refreshTimer;

connectStream();
refreshTimer = setInterval(() => {
  refreshHealth().catch((error) => {
    recordHealthError(error);
  });
}, refreshMs);
await refreshHealth().catch((error) => {
  recordHealthError(error);
});
render();

function connectStream() {
  socket = new WebSocket(streamUrl);
  socket.on('open', () => {
    metrics.stream.connected = true;
    render();
  });
  socket.on('message', (raw) => {
    try {
      const payload = JSON.parse(raw.toString());
      if (payload.type !== 'risk_verdict' || !payload.verdict) return;
      sdkMetrics.recordVerdict(payload.verdict);
      metrics.stream.lastMessageAt = new Date().toISOString();
      render();
    } catch {
      metrics.errors += 1;
    }
  });
  socket.on('error', () => {
    metrics.errors += 1;
  });
  socket.on('close', () => {
    metrics.stream.connected = false;
    if (shuttingDown) return;
    metrics.stream.reconnects += 1;
    setTimeout(connectStream, Math.min(refreshMs, 10_000));
    render();
  });
}

async function refreshHealth() {
  const response = await fetch(`${backendUrl}/health`, {
    signal: AbortSignal.timeout(Math.min(refreshMs, 10_000)),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const health = await response.json();
  metrics.backend.connected = true;
  metrics.backend.status = health.status ?? 'unknown';
  metrics.backend.walletConfigured = Boolean(health.wallet?.configured);
  render();
}

function recordHealthError(error) {
  metrics.errors += 1;
  metrics.backend.connected = false;
  if (output === 'pretty') console.error(`Healthcheck: ${error.message}`);
}

function render() {
  const sdkSnapshot = sdkMetrics.snapshot();
  const snapshot = {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - Date.parse(metrics.startedAt)) / 1000),
    ...metrics,
    verdicts: {
      total: Object.values(sdkSnapshot.byRisk).reduce((total, count) => total + count, 0),
      byRisk: sdkSnapshot.byRisk,
      mfaRequired: sdkSnapshot.mfaRequired,
      contractBlocks: sdkSnapshot.contractBlocks,
    },
  };
  if (output === 'json') {
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return;
  }
  process.stdout.write('\u001b[2J\u001b[H');
  console.log('Áureo · métricas en tiempo real');
  console.log(`Actualizado: ${snapshot.timestamp}`);
  console.log(`Backend: ${metrics.backend.connected ? metrics.backend.status : 'desconectado'}`);
  console.log(`Wallet operativa: ${metrics.backend.walletConfigured ? 'configurada' : 'no configurada'}`);
  console.log(`Stream: ${metrics.stream.connected ? 'conectado' : 'desconectado'}`);
  console.log(`Reconexiones: ${metrics.stream.reconnects}`);
  console.log('');
  console.log(`Veredictos recibidos: ${snapshot.verdicts.total}`);
  console.log(`Riesgo: ${formatRisks(snapshot.verdicts.byRisk)}`);
  console.log(`MFA requerida: ${snapshot.verdicts.mfaRequired}`);
  console.log(`Recomendaciones de bloqueo: ${snapshot.verdicts.contractBlocks}`);
  console.log(`Último veredicto: ${metrics.stream.lastMessageAt ?? 'ninguno'}`);
  console.log(`Errores de integración: ${metrics.errors}`);
  console.log('');
  console.log('Ctrl+C para salir.');
}

function formatRisks(byRisk) {
  return ['bajo', 'medio', 'alto', 'critico']
    .map((risk) => `${risk}=${byRisk[risk] ?? 0}`)
    .join(' · ');
}

function parseInterval(value) {
  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < 1000) {
    throw new Error('METRICS_REFRESH_MS debe ser un entero de al menos 1000 ms.');
  }
  return interval;
}

function shutdown() {
  shuttingDown = true;
  clearInterval(refreshTimer);
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
    socket.close();
  }
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
