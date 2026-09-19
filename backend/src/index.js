import 'dotenv/config';
import { createServer } from 'node:http';
import { ethers } from 'ethers';
import { WebSocketServer } from 'ws';
import { createAnalyzer } from './analyzer.js';
import { createEthWallet } from './wallet.js';

const ABI = [
  'event CorporateTransferRecorded(uint256 indexed operationId,address indexed initiator,address indexed beneficiary,uint256 amount,bytes32 operationReference,uint256 timestamp)',
  'event AlertStarted(uint256 indexed alertId,bytes32 indexed operationReference,uint8 riskLevel,string reason,uint256 timestamp)',
];

const windowMs = 60_000;
const maxBodyBytes = 1_048_576;
const maxBufferedEvents = 10_000;
const maxVerdicts = 100;
const events = [];
const historicalAmounts = new Map();
const verdicts = [];
const streamClients = new Set();

/**
 * Starts the WebSocket event ingestion and periodic risk analysis.
 */
export async function start() {
  const wsUrl = process.env.BLOCKCHAIN_WS_URL ?? 'ws://127.0.0.1:8545';
  const address = process.env.AUREO_CORE_ADDRESS;
  if (!address) throw new Error('AUREO_CORE_ADDRESS es obligatorio.');

  const provider = new ethers.WebSocketProvider(wsUrl);
  const contract = new ethers.Contract(address, ABI, provider);
  const ethWallet = createEthWallet(provider);
  const signedContract = ethWallet ? contract.connect(ethWallet.wallet) : null;
  const analyzer = createAnalyzer();
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
    if (request.method === 'POST' && requestUrl.pathname === '/reports') {
      try {
        const payload = JSON.parse(await readRequestBody(request));
        if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) {
          throw new Error('query debe ser un texto no vacío.');
        }
        sendJson(response, 200, { query: payload.query.trim(), verdicts });
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

  contract.on('CorporateTransferRecorded', (...args) => {
    const event = args.at(-1);
    events.push({
      type: 'CorporateTransferRecorded',
      operationId: args[0].toString(),
      initiator: args[1],
      beneficiary: args[2],
      amount: args[3].toString(),
      operationReference: args[4],
      blockNumber: event?.blockNumber ?? event?.log?.blockNumber,
    });
    if (events.length > maxBufferedEvents) events.splice(0, events.length - maxBufferedEvents);
  });

  let processingWindow = false;
  const windowTimer = setInterval(async () => {
    if (processingWindow) return;
    if (!events.length) return;
    processingWindow = true;
    const window = events.splice(0, events.length);
    try {
      const verdict = await analyzer.analyzeWindow(window, {
        historicalAmounts,
        operationalReserve: Number(process.env.OPERATIONAL_RESERVE ?? Number.NaN),
      });
      const message = { type: 'risk_verdict', verdict, receivedAt: new Date().toISOString() };
      verdicts.push(message);
      if (verdicts.length > maxVerdicts) verdicts.shift();
      const serialized = JSON.stringify(message);
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
        history.push(Number(event.amount));
        historicalAmounts.set(key, history.slice(-100));
      }
    } catch (error) {
      console.error(error);
    } finally {
      processingWindow = false;
    }
  }, windowMs);

  console.log(`Áureo escuchando eventos en ${wsUrl}`);
  console.log(
    ethWallet
      ? `Wallet Ethereum operativa: ${ethWallet.address}`
      : 'Wallet Ethereum no configurada; backend en modo solo lectura.',
  );

  const shutdown = async (signal) => {
    clearInterval(windowTimer);
    contract.removeAllListeners();
    for (const client of streamClients) client.close();
    await new Promise((resolve) => webSocketServer.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
    await provider.destroy();
    console.log(`Áureo detenido (${signal}).`);
  };

  process.once('SIGINT', () => shutdown('SIGINT').catch(console.error));
  process.once('SIGTERM', () => shutdown('SIGTERM').catch(console.error));

  return { httpServer, provider, shutdown };
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

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
