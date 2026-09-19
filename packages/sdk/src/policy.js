/**
 * @typedef {Object} PolicyResult
 * @property {boolean} speedViolation
 * @property {boolean} volumeViolation
 * @property {'bajo'|'medio'} minimumRisk
 * @property {string[]} reasons
 */

/**
 * Evaluates reusable, model-independent transaction policies.
 *
 * @param {Array<{initiator: string, amount: string|number, blockNumber: number}>} transfers
 * @param {{historicalAmounts?: Map<string, number[]>|Record<string, number[]>, operationalReserve?: number}} [context]
 * @returns {PolicyResult}
 */
export function evaluateEthereumPolicy(transfers, context = {}) {
  if (!Array.isArray(transfers)) throw new Error('transfers debe ser un arreglo.');
  const reasons = [];
  const speedViolation = hasSpeedViolation(transfers);
  const volumeViolation = transfers.some((transfer) => {
    const amount = toAmount(transfer.amount);
    const history = getHistory(context.historicalAmounts, transfer.initiator);
    const average = history.length
      ? history.reduce((sum, value) => sum + value, 0) / history.length
      : 0;
    return (
      (average > 0 && amount > average * 3) ||
      (Number.isFinite(context.operationalReserve) && amount > context.operationalReserve)
    );
  });

  if (speedViolation) {
    reasons.push('Más de 3 operaciones de una dirección en 5 bloques consecutivos.');
  }
  if (volumeViolation) {
    reasons.push('El volumen supera 300% del histórico o la reserva operativa; requiere MFA.');
  }
  return {
    speedViolation,
    volumeViolation,
    minimumRisk: volumeViolation ? 'medio' : 'bajo',
    reasons,
  };
}

function hasSpeedViolation(transfers) {
  const blocksByAddress = new Map();
  for (const transfer of transfers) {
    const block = Number(transfer.blockNumber);
    if (!Number.isInteger(block) || block < 0) continue;
    const key = transfer.initiator.toLowerCase();
    blocksByAddress.set(key, [...(blocksByAddress.get(key) ?? []), block]);
  }
  return [...blocksByAddress.values()].some((blocks) => {
    blocks.sort((a, b) => a - b);
    return blocks.some(
      (block, index) => blocks[index + 3] !== undefined && blocks[index + 3] - block <= 4,
    );
  });
}

function toAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Monto inválido.');
  return amount;
}

function getHistory(history, address) {
  if (!history || !address) return [];
  const values =
    history instanceof Map
      ? (history.get(address) ?? history.get(address.toLowerCase()))
      : (history[address] ?? history[address.toLowerCase()]);
  if (!Array.isArray(values)) throw new Error(`Histórico inválido para ${address}.`);
  return values.map(toAmount);
}
