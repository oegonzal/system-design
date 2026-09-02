import { AnthropicLlmClient, DEFAULT_LLM_MODEL } from './anthropic-client';
import type { LlmClient } from './llm-client';
import { NoopLlmClient } from './noop-client';

/**
 * Environment-driven factory — the only place LLM env vars are read.
 *
 * EVAL_DETERMINISTIC=1 outranks a present API key: CI and the e2e suite set
 * it so evaluations are byte-reproducible even on machines where a developer
 * has a key exported.
 */
export function createLlmClientFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (env['EVAL_DETERMINISTIC'] === '1') return new NoopLlmClient();
  if (!env['ANTHROPIC_API_KEY']) return new NoopLlmClient();

  return new AnthropicLlmClient({
    apiKey: env['ANTHROPIC_API_KEY'],
    model: env['LLM_MODEL'] || undefined,
  });
}

/**
 * The improver (AI coach) reads its own determinism switch,
 * `IMPROVER_DETERMINISTIC`, falling back to `EVAL_DETERMINISTIC`. The
 * distinction exists because the two flags protect different things:
 * `EVAL_DETERMINISTIC` keeps GRADING byte-reproducible, while the improver
 * only PROPOSES — every proposal is re-scored by the deterministic engine, so
 * a live improver never touches a grade. A dev stack can therefore run
 * `EVAL_DETERMINISTIC=1 IMPROVER_DETERMINISTIC=0` and get deterministic
 * grades with a live coach; CI and e2e set neither override and stay fully
 * deterministic.
 */
const improverEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...env,
  EVAL_DETERMINISTIC: env['IMPROVER_DETERMINISTIC'] ?? env['EVAL_DETERMINISTIC'],
});

export function createImproverLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  return createLlmClientFromEnv(improverEnv(env));
}

export interface ImproverAvailability {
  enabled: boolean;
  model: string | null;
  reason: 'deterministic' | 'no-key' | null;
}

/**
 * Derived facts only — never the key. Answers "would `createImproverLlmFromEnv`
 * yield a live client, and why not" without constructing one, so the API can
 * report availability per request.
 */
export function improverAvailabilityFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ImproverAvailability {
  const derived = improverEnv(env);
  if (derived['EVAL_DETERMINISTIC'] === '1') {
    return { enabled: false, model: null, reason: 'deterministic' };
  }
  if (!derived['ANTHROPIC_API_KEY']) {
    return { enabled: false, model: null, reason: 'no-key' };
  }
  return { enabled: true, model: derived['LLM_MODEL'] || DEFAULT_LLM_MODEL, reason: null };
}
