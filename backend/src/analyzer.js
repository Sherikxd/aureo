import OpenAI from 'openai';
import { evaluateEthereumPolicy } from '@aureo/sdk';

const RISK_LEVELS = new Set(['bajo', 'medio', 'alto', 'critico']);
const RISK_RANK = { bajo: 0, medio: 1, alto: 2, critico: 3 };
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

/**
 * @typedef {Object} RiskVerdict
 * @property {'bajo'|'medio'|'alto'|'critico'} nivel_riesgo
 * @property {string} motivo
 * @property {boolean} bloquear_contrato
 * @property {boolean} requiere_mfa
 * @property {'groq'|'xai'|'determinista'|'determinista_degradado'} fuente
 */

/**
 * Creates a stateless analyzer backed by an OpenAI-compatible provider.
 * @param {{provider?: 'groq'|'xai'|'auto'|'none', apiKey?: string, baseURL?: string, model?: string, timeoutMs?: number, maxRetries?: number, retryDelayMs?: number}} [options]
 */
export function createAnalyzer(options = {}) {
  const reportMetric = options.onMetric ?? (() => {});
  const provider = resolveProvider(options);
  const fallbackProviders = options.llmFallbackProviders ??
    (process.env.LLM_FALLBACK_PROVIDERS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const providerConfig = getProviderConfig(provider, options);
  const apiKey = options.apiKey ?? providerConfig.apiKey;
  const client = apiKey
    ? new OpenAI({
        apiKey,
        baseURL: options.baseURL ?? providerConfig.baseURL,
        timeout: options.timeoutMs ?? parsePositiveInteger(
          process.env.LLM_TIMEOUT_MS ?? process.env.XAI_TIMEOUT_MS,
          DEFAULT_TIMEOUT_MS,
        ),
      })
    : null;
  const model = options.model ?? providerConfig.model;
  const timeoutMs =
    options.timeoutMs ??
    parsePositiveInteger(process.env.LLM_TIMEOUT_MS ?? process.env.XAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxRetries =
    options.maxRetries ??
    parseNonNegativeInteger(process.env.LLM_MAX_RETRIES ?? process.env.XAI_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const retryDelayMs =
    options.retryDelayMs ??
    parseNonNegativeInteger(
      process.env.LLM_RETRY_DELAY_MS ?? process.env.XAI_RETRY_DELAY_MS,
      DEFAULT_RETRY_DELAY_MS,
    );
  const policyOptions = {
    speedThreshold: parsePositiveInteger(process.env.SPEED_THRESHOLD, 3),
    speedBlockWindow: parseNonNegativeInteger(process.env.SPEED_BLOCK_WINDOW, 4),
    volumeMultiplier: parsePositiveInteger(process.env.VOLUME_MULTIPLIER, 3),
  };

  return {
    /**
     * @param {unknown[]} events
     * @param {{historicalAmounts?: Map<string, Array<string|number|bigint>>|Record<string, Array<string|number|bigint>>, operationalReserve?: string|number|bigint}} [context]
     * @returns {Promise<RiskVerdict>}
     */
    async analyzeWindow(events, context = {}) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error('La ventana de análisis debe contener al menos un evento.');
      }

      const rules = evaluateRules(events, { ...context, ...policyOptions });
      if (rules.speedViolation) {
        return {
          nivel_riesgo: 'alto',
          motivo: rules.reasons.join(' '),
          bloquear_contrato: true,
          requiere_mfa: false,
          fuente: 'determinista',
        };
      }

      if (!client) return fallbackVerdict(rules, 'No hay credenciales de un proveedor LLM configurado.');

      try {
        reportMetric('llm_call');
        const completion = await withRetry(
          () =>
            client.chat.completions.create({
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
                    eventos: events.map(toModelEvent),
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
            }),
          maxRetries,
          retryDelayMs,
          timeoutMs,
        );
        const verdict = validateVerdict(
          JSON.parse(completion.choices[0]?.message?.content ?? ''),
          rules,
        );
        reportMetric('llm_success');
        return {
          ...verdict,
          fuente: provider,
          nivel_riesgo:
            RISK_RANK[verdict.nivel_riesgo] >= RISK_RANK[rules.minimumRisk]
              ? verdict.nivel_riesgo
              : rules.minimumRisk,
          motivo: [...rules.reasons, verdict.motivo].filter(Boolean).join(' '),
          requiere_mfa: verdict.requiere_mfa || rules.volumeViolation,
        };
      } catch (error) {
        reportMetric('llm_error');
        const fallbackProvider = fallbackProviders.shift();
        if (fallbackProvider && fallbackProvider !== provider) {
          reportMetric('llm_fallback');
          return createAnalyzer({
            ...options,
            provider: fallbackProvider,
            llmFallbackProviders: fallbackProviders,
            onMetric: reportMetric,
          }).analyzeWindow(events, context);
        }
        return fallbackVerdict(rules, `LLM no disponible: ${error.message}`);
      }
    },
  };
}

/**
 * Applies rules that must not depend on model availability.
 * @param {unknown[]} events
 * @param {{historicalAmounts?: Map<string, Array<string|number|bigint>>|Record<string, Array<string|number|bigint>>, operationalReserve?: string|number|bigint}} context
 */
export function evaluateRules(events, context = {}) {
  const transfers = events.filter((event) => isTransfer(event));
  return evaluateEthereumPolicy(transfers, context);
}

function isTransfer(event) {
  return Boolean(event && typeof event === 'object' && 'initiator' in event && 'amount' in event);
}

/**
 * @param {unknown} value
 * @returns {RiskVerdict}
 */
function validateVerdict(value, rules) {
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
  if (RISK_RANK[verdict.nivel_riesgo] >= RISK_RANK.alto) verdict.bloquear_contrato = true;
  if (rules.volumeViolation) verdict.requiere_mfa = true;
  return /** @type {RiskVerdict} */ (verdict);
}

function fallbackVerdict(rules, reason) {
  return {
    nivel_riesgo: rules.minimumRisk,
    motivo: [...rules.reasons, reason].filter(Boolean).join(' '),
    bloquear_contrato: false,
    requiere_mfa: rules.volumeViolation,
    fuente: 'determinista_degradado',
  };
}

function toModelEvent(event) {
  return {
    initiator: event.initiator,
    amount: event.amount,
    blockNumber: event.blockNumber,
  };
}

async function withRetry(operation, maxRetries, retryDelayMs, timeoutMs) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`timeout después de ${timeoutMs} ms`)), timeoutMs),
        ),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 2 ** attempt));
    }
  }
  throw lastError;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveProvider(options) {
  const configured = options.provider ?? process.env.LLM_PROVIDER ?? 'auto';
  if (!['auto', 'groq', 'xai', 'none'].includes(configured)) {
    throw new Error('LLM_PROVIDER debe ser auto, groq, xai o none.');
  }
  if (configured !== 'auto') return configured;
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.XAI_API_KEY) return 'xai';
  return 'none';
}

function getProviderConfig(provider, options) {
  if (provider === 'groq') {
    return {
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    };
  }
  if (provider === 'xai') {
    return {
      apiKey: process.env.XAI_API_KEY,
      baseURL: process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1',
      model: process.env.XAI_MODEL ?? 'grok-4.6',
    };
  }
  if (provider === 'none') return { apiKey: undefined, baseURL: undefined, model: undefined };
  return {
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    model: options.model,
  };
}
