import { evaluateEthereumPolicy } from './policy.js';

/**
 * Creates an in-memory metrics collector for transfer policies and verdicts.
 *
 * @returns {{
 *   recordTransfer: (transfer: {initiator: string, amount: string|number|bigint, blockNumber: number}) => import('./policy.js').PolicyResult,
 *   recordVerdict: (verdict: {nivel_riesgo: string, requiere_mfa?: boolean, bloquear_contrato?: boolean}) => void,
 *   snapshot: () => object,
 *   reset: () => void
 * }}
 */
export function createMetrics() {
  const transfers = [];
  const history = new Map();
  const snapshot = {
    transfers: 0,
    totalAmount: 0n,
    byRisk: {},
    mfaRequired: 0,
    contractBlocks: 0,
    lastPolicy: null,
    lastVerdict: null,
  };

  return {
    recordTransfer(transfer) {
      const initiator = transfer.initiator.toLowerCase();
      const previousHistory = history.get(initiator) ?? [];
      const pendingTransfers = [...transfers, transfer];
      const policy = evaluateEthereumPolicy(pendingTransfers, {
        historicalAmounts: new Map([[initiator, previousHistory]]),
      });
      transfers.push(transfer);
      history.set(initiator, [...previousHistory, transfer.amount].slice(-100));
      snapshot.transfers += 1;
      snapshot.totalAmount += BigInt(transfer.amount);
      snapshot.lastPolicy = policy;
      const risk = policy.speedViolation
        ? 'alto'
        : policy.volumeViolation
          ? 'medio'
          : 'bajo';
      snapshot.byRisk[risk] = (snapshot.byRisk[risk] ?? 0) + 1;
      if (policy.volumeViolation) snapshot.mfaRequired += 1;
      if (policy.speedViolation) snapshot.contractBlocks += 1;
      return policy;
    },
    recordVerdict(verdict) {
      const risk = verdict.nivel_riesgo ?? 'desconocido';
      snapshot.byRisk[risk] = (snapshot.byRisk[risk] ?? 0) + 1;
      if (verdict.requiere_mfa) snapshot.mfaRequired += 1;
      if (verdict.bloquear_contrato) snapshot.contractBlocks += 1;
      snapshot.lastVerdict = verdict;
    },
    snapshot() {
      return {
        ...snapshot,
        totalAmount: snapshot.totalAmount.toString(),
        byRisk: { ...snapshot.byRisk },
        lastPolicy: snapshot.lastPolicy ? { ...snapshot.lastPolicy } : null,
        lastVerdict: snapshot.lastVerdict ? { ...snapshot.lastVerdict } : null,
      };
    },
    reset() {
      transfers.length = 0;
      history.clear();
      snapshot.transfers = 0;
      snapshot.totalAmount = 0n;
      snapshot.byRisk = {};
      snapshot.mfaRequired = 0;
      snapshot.contractBlocks = 0;
      snapshot.lastPolicy = null;
      snapshot.lastVerdict = null;
    },
  };
}
