import OpenAI from 'openai';

const RISK_LEVELS = new Set(['bajo', 'medio', 'alto', 'critico']);
const RISK_RANK = { bajo: 0, medio: 1, alto: 2, critico: 3 };

/**
 * @typedef {Object} RiskVerdict
 * @property {'bajo'|'medio'|'alto'|'critico'} nivel_riesgo
 * @property {string} motivo
 * @property {boolean} bloquear_contrato
 * @property {boolean} requiere_mfa
 */

/**
 * Creates a stateless analyzer backed by xAI's OpenAI-compatible API.
 * @param {{apiKey?: string, baseURL?: string, model?: string}} [options]
 */
export function createAnalyzer(options = {}) {
  const apiKey = options.apiKey ?? process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY es obligatorio para iniciar el analizador.');

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL ?? process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1',
  });
  const model = options.model ?? process.env.XAI_MODEL ?? 'grok-4.6';

  return {
    /**
     * @param {unknown[]} events
     * @param {{historicalAmounts?: Map<string, number[]>|Record<string, number[]>, operationalReserve?: number}} [context]
     * @returns {Promise<RiskVerdict>}
     */
    async analyzeWindow(events, context = {}) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error('La ventana de análisis debe contener al menos un evento.');
      }

      const rules = evaluateRules(events, context);
      if (rules.speedViolation) {
        return {
          nivel_riesgo: 'alto',
          motivo: rules.reasons.join(' '),
          bloquear_contrato: true,
          requiere_mfa: false,
        };
      }

      try {
        const completion = await client.chat.completions.create({
          model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Eres un analista senior de fraude Web3. Responde únicamente con el objeto JSON solicitado.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                tarea: 'Clasifica el riesgo agregado de estos eventos corporativos.',
                eventos: events,
                reglas_deterministas: rules.reasons,
                esquema: {
                  nivel_riesgo: 'bajo|medio|alto|critico',
                  motivo: 'explicación breve en español',
                  bloquear_contrato: 'boolean',
                  requiere_mfa: 'boolean',
                },
              }),
            },
          ],
          response_format: { type: 'json_object' },
        });
        const verdict = validateVerdict(JSON.parse(completion.choices[0]?.message?.content ?? ''));
        return {
          ...verdict,
          nivel_riesgo:
            RISK_RANK[verdict.nivel_riesgo] >= RISK_RANK[rules.minimumRisk]
              ? verdict.nivel_riesgo
              : rules.minimumRisk,
          motivo: [...rules.reasons, verdict.motivo].filter(Boolean).join(' '),
          requiere_mfa: verdict.requiere_mfa || rules.volumeViolation,
        };
      } catch (error) {
        throw new Error(`No se pudo analizar la ventana con xAI: ${error.message}`, {
          cause: error,
        });
      }
    },
  };
}

/**
 * Applies rules that must not depend on model availability.
 * @param {unknown[]} events
 * @param {{historicalAmounts?: Map<string, number[]>|Record<string, number[]>, operationalReserve?: number}} context
 */
export function evaluateRules(events, context = {}) {
  const transfers = events.filter((event) => isTransfer(event));
  const reasons = [];
  const speedViolation = hasBlockSpeedViolation(transfers);
  if (speedViolation) {
    reasons.push(
      'Regla de velocidad: una dirección ejecutó más de 3 operaciones en 5 bloques consecutivos.',
    );
  }

  const volumeViolation = transfers.some((event) => {
    const amount = toAmount(event.amount);
    const history = getHistory(context.historicalAmounts, event.initiator);
    const average = history.length
      ? history.reduce((sum, value) => sum + value, 0) / history.length
      : 0;
    const exceedsAverage = average > 0 && amount > average * 3;
    const exceedsReserve =
      Number.isFinite(context.operationalReserve) && amount > context.operationalReserve;
    return exceedsAverage || exceedsReserve;
  });
  if (volumeViolation) {
    reasons.push(
      'Regla de volumen: una transacción supera 300% del promedio histórico o la reserva operativa declarada; se requiere MFA.',
    );
  }

  return {
    speedViolation,
    volumeViolation,
    minimumRisk: volumeViolation ? 'medio' : 'bajo',
    reasons,
  };
}

function hasBlockSpeedViolation(transfers) {
  const byAddress = new Map();
  for (const transfer of transfers) {
    const blockNumber = Number(transfer.blockNumber);
    if (!Number.isInteger(blockNumber) || blockNumber < 0) continue;
    const address = String(transfer.initiator).toLowerCase();
    const blocks = byAddress.get(address) ?? [];
    blocks.push(blockNumber);
    byAddress.set(address, blocks);
  }

  return [...byAddress.values()].some((blocks) => {
    blocks.sort((left, right) => left - right);
    return blocks.some(
      (block, index) =>
        blocks.slice(index, index + 4).length === 4 && blocks[index + 3] - block <= 4,
    );
  });
}

function isTransfer(event) {
  return Boolean(event && typeof event === 'object' && 'initiator' in event && 'amount' in event);
}

function toAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Monto de transferencia inválido.');
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

/**
 * @param {unknown} value
 * @returns {RiskVerdict}
 */
function validateVerdict(value) {
  if (!value || typeof value !== 'object') throw new Error('El veredicto no es un objeto JSON.');
  const verdict = /** @type {Record<string, unknown>} */ (value);
  if (!RISK_LEVELS.has(verdict.nivel_riesgo)) throw new Error('nivel_riesgo inválido.');
  if (typeof verdict.motivo !== 'string' || verdict.motivo.trim() === '') {
    throw new Error('motivo inválido.');
  }
  if (typeof verdict.bloquear_contrato !== 'boolean') {
    throw new Error('bloquear_contrato inválido.');
  }
  if (verdict.requiere_mfa !== undefined && typeof verdict.requiere_mfa !== 'boolean') {
    throw new Error('requiere_mfa inválido.');
  }
  verdict.requiere_mfa ??= false;
  return /** @type {RiskVerdict} */ (verdict);
}
