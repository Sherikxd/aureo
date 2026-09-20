import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const EMPTY_STATE = {
  lastScannedBlock: -1,
  events: [],
  historicalAmounts: {},
  verdicts: [],
};

export function loadState(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return {
      lastScannedBlock: Number.isInteger(parsed.lastScannedBlock) ? parsed.lastScannedBlock : -1,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      historicalAmounts:
        parsed.historicalAmounts && typeof parsed.historicalAmounts === 'object'
          ? parsed.historicalAmounts
          : {},
      verdicts: Array.isArray(parsed.verdicts) ? parsed.verdicts : [],
    };
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY_STATE);
    throw new Error(`No se pudo cargar el estado del backend: ${error.message}`, { cause: error });
  }
}

export function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  renameSync(temporaryFile, file);
}
