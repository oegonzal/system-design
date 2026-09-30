import type { LlmModelDto } from '@sysdesign/contracts';

import { readClaudeAccount, signedIn, type ClaudeAccount } from './claude-account';
import { ClaudeAgentLlmClient, SUBSCRIPTION_MODEL_LABEL } from './claude-agent-client';
import { DisabledEmbeddingClient, type EmbeddingClient } from './embedding-client';
import type { LlmClient } from './llm-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

/**
 * Environment-driven factories — the only place LLM env vars are read.
 *
 * The quality loop runs on a Claude Code subscription login and nothing else:
 * this machine's `claude login`, or — where there is no login, a container —
 * the long-lived `CLAUDE_CODE_OAUTH_TOKEN` that `claude setup-token` prints.
 * No API key is read, and none reaches the CLI. A process without a login is
 * a boot failure saying how to get one, never a client that quietly fails
 * every call.
 */
export const MODEL_PROVIDER_HELP =
  'the quality loop runs only on a Claude Code subscription login and found none: run `claude login` on this machine, or give a container the CLAUDE_CODE_OAUTH_TOKEN that `claude setup-token` prints';

export class MissingModelProviderError extends Error {
  override readonly name = 'MissingModelProvider';

  constructor(cause?: unknown) {
    super(
      cause === undefined
        ? MODEL_PROVIDER_HELP
        : `${MODEL_PROVIDER_HELP} (the login check failed: ${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
}

/** The model report a boot announces: the pinned `LLM_MODEL`, else the subscription's label. */
export const describeModelProvider = (env: NodeJS.ProcessEnv = process.env): LlmModelDto => ({
  model: env['LLM_MODEL'] || SUBSCRIPTION_MODEL_LABEL,
});

/**
 * Refuse unless Claude Code reports a login. The account is asked of the
 * CLI itself, so a Keychain login and an OAuth token are recognised alike;
 * a check that cannot finish is a refusal too.
 */
export async function assertSubscriptionLogin(
  read: () => Promise<ClaudeAccount> = () => readClaudeAccount(),
): Promise<void> {
  let account: ClaudeAccount;
  try {
    account = await read();
  } catch (error) {
    throw new MissingModelProviderError(error);
  }
  if (!signedIn(account)) throw new MissingModelProviderError();
}

export function createQualityLoopLlmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  return new ClaudeAgentLlmClient({ model: env['LLM_MODEL'] || undefined });
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
