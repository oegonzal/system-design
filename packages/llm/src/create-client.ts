import type { LlmAvailabilityDto } from '@sysdesign/contracts';
import { AnthropicLlmClient, DEFAULT_LLM_MODEL } from './anthropic-client';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  DEFAULT_EMBEDDING_MODEL,
  NoopEmbeddingClient,
  type EmbeddingClient,
} from './embedding-client';
import type { LlmClient } from './llm-client';
import { NoopLlmClient } from './noop-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

/**
 * Environment-driven factories — the only place LLM env vars are read.
 *
 * A model-consuming ROLE names its own determinism switch and its own
 * subscription opt-in. Determinism outranks everything: CI and the e2e suite
 * set it so nothing a test reads depends on a model, even on a machine where
 * a developer has a key exported. An explicit API key wins over the
 * subscription route, and `<authVar>=claude-code` runs the role through this
 * machine's Claude Code login via the Agent SDK — no API key required, none
 * ever read.
 */
export interface LlmRole {
  /** `<var>=1` yields the no-op client whatever else is set. */
  deterministicVar: string;
  /** `<var>=claude-code` routes through the Agent SDK. */
  authVar: string;
}

/** The quality loop's producer and lenses — the one model-consuming role the stack runs. */
export const QUALITY_LOOP_ROLE: LlmRole = {
  deterministicVar: 'QUALITY_LOOP_DETERMINISTIC',
  authVar: 'QUALITY_LOOP_AUTH',
};

export function createRoleLlmFromEnv(
  role: LlmRole,
  env: NodeJS.ProcessEnv = process.env,
): LlmClient {
  if (env[role.deterministicVar] === '1') return new NoopLlmClient();
  if (env['ANTHROPIC_API_KEY']) {
    return new AnthropicLlmClient({
      apiKey: env['ANTHROPIC_API_KEY'],
      model: env['LLM_MODEL'] || undefined,
    });
  }
  if (env[role.authVar] === 'claude-code') {
    return new ClaudeAgentLlmClient({ model: env['LLM_MODEL'] || undefined });
  }
  return new NoopLlmClient();
}

/** The wire shape (`contracts`) is the one definition; this is its node-side name. */
export type LlmAvailability = LlmAvailabilityDto;

/**
 * Derived facts only — never the key. Answers "would the role's factory yield
 * a live client, and why not" without constructing one, so a service can
 * report availability per request.
 */
export function roleAvailabilityFromEnv(
  role: LlmRole,
  env: NodeJS.ProcessEnv = process.env,
): LlmAvailability {
  if (env[role.deterministicVar] === '1') {
    return { enabled: false, model: null, reason: 'deterministic' };
  }
  if (env['ANTHROPIC_API_KEY']) {
    return { enabled: true, model: env['LLM_MODEL'] || DEFAULT_LLM_MODEL, reason: null };
  }
  if (env[role.authVar] === 'claude-code') {
    return { enabled: true, model: env['LLM_MODEL'] || 'claude-code/subscription', reason: null };
  }
  return { enabled: false, model: null, reason: 'no-key' };
}

export const createQualityLoopLlmFromEnv = (env: NodeJS.ProcessEnv = process.env): LlmClient =>
  createRoleLlmFromEnv(QUALITY_LOOP_ROLE, env);

export const qualityLoopAvailabilityFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): LlmAvailability => roleAvailabilityFromEnv(QUALITY_LOOP_ROLE, env);

/**
 * The quality loop's embeddings: the loop's own determinism switch first, then
 * `OPENAI_API_KEY`. `OPENAI_EMBEDDING_MODEL` picks the model; `OPENAI_MODEL`
 * names a chat model and stays unread.
 */
export function createEmbeddingClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingClient {
  if (env[QUALITY_LOOP_ROLE.deterministicVar] === '1') return new NoopEmbeddingClient();
  if (!env['OPENAI_API_KEY']) return new NoopEmbeddingClient();
  return new OpenAiEmbeddingClient({
    apiKey: env['OPENAI_API_KEY'],
    model: env['OPENAI_EMBEDDING_MODEL'] || undefined,
  });
}

/** The embeddings factory's shadow: would it yield a live client, and why not. */
export function embeddingAvailabilityFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmAvailability {
  if (env[QUALITY_LOOP_ROLE.deterministicVar] === '1') {
    return { enabled: false, model: null, reason: 'deterministic' };
  }
  if (!env['OPENAI_API_KEY']) return { enabled: false, model: null, reason: 'no-key' };
  return {
    enabled: true,
    model: env['OPENAI_EMBEDDING_MODEL'] || DEFAULT_EMBEDDING_MODEL,
    reason: null,
  };
}
