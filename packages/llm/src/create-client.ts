import type { LlmModelDto } from '@sysdesign/contracts';
import { AnthropicLlmClient, DEFAULT_LLM_MODEL } from './anthropic-client';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import { DisabledEmbeddingClient, type EmbeddingClient } from './embedding-client';
import type { LlmClient } from './llm-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

/**
 * Environment-driven factories — the only place LLM env vars are read.
 *
 * The quality loop runs on a model or not at all. An explicit API key wins;
 * `QUALITY_LOOP_AUTH=claude-code` runs every call through this machine's
 * Claude Code login via the Agent SDK — no key read, none stored. Neither
 * configured is a boot failure naming both, never a client that quietly
 * answers nothing.
 */
export const QUALITY_LOOP_AUTH_VAR = 'QUALITY_LOOP_AUTH';
export const CLAUDE_CODE_ROUTE = 'claude-code';
export const CLAUDE_CODE_MODEL_LABEL = 'claude-code/subscription';

export const MODEL_PROVIDER_HELP =
  "the quality loop needs a model: set ANTHROPIC_API_KEY, or QUALITY_LOOP_AUTH=claude-code to run through this machine's Claude Code login";

export class MissingModelProviderError extends Error {
  override readonly name = 'MissingModelProvider';

  constructor() {
    super(MODEL_PROVIDER_HELP);
  }
}

export type QualityLoopProvider =
  { route: 'api'; apiKey: string; model: string } | { route: 'claude-code'; model: string };

/** Which route the environment configures, or the boot failure. */
export function resolveQualityLoopProvider(
  env: NodeJS.ProcessEnv = process.env,
): QualityLoopProvider {
  const apiKey = env['ANTHROPIC_API_KEY'];
  if (apiKey) return { route: 'api', apiKey, model: env['LLM_MODEL'] || DEFAULT_LLM_MODEL };
  if (env[QUALITY_LOOP_AUTH_VAR] === CLAUDE_CODE_ROUTE) {
    return { route: 'claude-code', model: env['LLM_MODEL'] || CLAUDE_CODE_MODEL_LABEL };
  }
  throw new MissingModelProviderError();
}

/** The model report a boot would announce, without constructing a client — the preflight's question. */
export const describeModelProvider = (env: NodeJS.ProcessEnv = process.env): LlmModelDto => ({
  model: resolveQualityLoopProvider(env).model,
});

export function createQualityLoopLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const provider = resolveQualityLoopProvider(env);
  return provider.route === 'api'
    ? new AnthropicLlmClient({ apiKey: provider.apiKey, model: provider.model })
    : new ClaudeAgentLlmClient({ model: env['LLM_MODEL'] || undefined });
}

/**
 * The quality loop's embeddings: `OPENAI_API_KEY`, else a disabled client that
 * carries its reason — the memory tier is optional. `OPENAI_EMBEDDING_MODEL`
 * picks the model; `OPENAI_MODEL` names a chat model and stays unread.
 */
export function createEmbeddingClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingClient {
  if (!env['OPENAI_API_KEY']) return new DisabledEmbeddingClient('no-key');
  return new OpenAiEmbeddingClient({
    apiKey: env['OPENAI_API_KEY'],
    model: env['OPENAI_EMBEDDING_MODEL'] || undefined,
  });
}
