#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import WebSocket from 'ws';

const program = new Command();

program
  .name('aureo')
  .description('Cliente CLI de observabilidad y compliance Web3')
  .version('0.1.0');

program
  .command('stream')
  .description('Muestra en tiempo real los veredictos de riesgo')
  .option('-u, --url <url>', 'WebSocket del backend', process.env.AUREO_STREAM_URL)
  .action((options) => {
    if (!options.url) throw new Error('Configura AUREO_STREAM_URL o proporciona --url.');
    const socket = new WebSocket(options.url);
    socket.on('open', () => console.log(`Conectado a ${options.url}. Ctrl+C para salir.`));
    socket.on('message', async (message) => {
      const payload = JSON.parse(message.toString());
      console.log(JSON.stringify(payload, null, 2));
      if (!payload.verdict?.requiere_mfa) return;
      const readline = createInterface({ input, output });
      try {
        const token = await readline.question('MFA requerida. Introduce tu código MFA: ');
        if (!token.trim()) console.error('MFA no proporcionada; la operación permanece pendiente.');
        else console.log('MFA recibida; requiere validación por el proveedor de identidad.');
      } finally {
        readline.close();
      }
    });
    socket.on('error', (error) => {
      console.error(`Error del stream: ${error.message}`);
      process.exitCode = 1;
    });
    process.once('SIGINT', () => {
      socket.close();
      process.exit(0);
    });
  });

program
  .command('report')
  .description('Consulta un reporte de auditoría en lenguaje natural')
  .argument('<query>', 'Pregunta para el reporte')
  .option('-u, --url <url>', 'API del backend', process.env.AUREO_BACKEND_URL)
  .action(async (query, options) => {
    if (!options.url) throw new Error('Configura AUREO_BACKEND_URL o proporciona --url.');
    try {
      const response = await fetch(`${options.url}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error(`Backend respondió HTTP ${response.status}.`);
      console.log(JSON.stringify(await response.json(), null, 2));
    } catch (error) {
      console.error(`No se pudo obtener el reporte: ${error.message}`);
      process.exitCode = 1;
    }
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
