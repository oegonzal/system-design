import { AnthropicLlmClient } from './anthropic-client';
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
