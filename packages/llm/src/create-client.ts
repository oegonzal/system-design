import { AnthropicLlmClient, DEFAULT_LLM_MODEL } from './anthropic-client';
import { ClaudeAgentLlmClient } from './claude-agent-client';
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
 * The eval critic's client. Same determinism-first ordering as
 * `createLlmClientFromEnv`, plus one opt-in route: `EVAL_AUTH=claude-code` runs
 * the eval passes through the machine's Claude Code login (a subscription) via
 * the Agent SDK — for a developer with no API key who wants the graded critic
 * live. Unlike the improver, eval reads the RAW `EVAL_DETERMINISTIC` with no
 * override fork: eval determinism protects grading reproducibility and must
 * never be switchable, so CI/e2e/calibration (which set `EVAL_DETERMINISTIC=1`)
 * stay byte-identical, and the subscription route is inert unless explicitly
 * opted into.
 */
export function createEvalLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (env['EVAL_DETERMINISTIC'] === '1') return new NoopLlmClient();
  if (env['ANTHROPIC_API_KEY']) {
    return new AnthropicLlmClient({
      apiKey: env['ANTHROPIC_API_KEY'],
      model: env['LLM_MODEL'] || undefined,
    });
  }
  if (env['EVAL_AUTH'] === 'claude-code') {
    return new ClaudeAgentLlmClient({ model: env['LLM_MODEL'] || undefined });
  }
  return new NoopLlmClient();
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

/**
 * The improver's second auth route: `IMPROVER_AUTH=claude-code` runs coach
 * calls through the machine's Claude Code login (a Claude subscription) via
 * the Agent SDK — no API key required, none ever read. An explicit API key
 * still wins when both are configured, and determinism outranks everything.
 */
export function createImproverLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const derived = improverEnv(env);
  if (derived['EVAL_DETERMINISTIC'] === '1') return new NoopLlmClient();
  if (derived['ANTHROPIC_API_KEY']) return createLlmClientFromEnv(derived);
  if (derived['IMPROVER_AUTH'] === 'claude-code') {
    return new ClaudeAgentLlmClient({ model: derived['LLM_MODEL'] || undefined });
  }
  return new NoopLlmClient();
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
  if (derived['ANTHROPIC_API_KEY']) {
    return { enabled: true, model: derived['LLM_MODEL'] || DEFAULT_LLM_MODEL, reason: null };
  }
  if (derived['IMPROVER_AUTH'] === 'claude-code') {
    return {
      enabled: true,
      model: derived['LLM_MODEL'] || 'claude-code/subscription',
      reason: null,
    };
  }
  return { enabled: false, model: null, reason: 'no-key' };
}
