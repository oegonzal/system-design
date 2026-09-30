import type { LlmModelDto } from '@sysdesign/contracts';

import { describeAccount, readClaudeAccount, signedIn, type ClaudeAccount } from './claude-account';
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
 * No API key is read, and none reaches the CLI. A process without the
 * subscription is a boot failure saying how to get one, never a client that
 * quietly fails every call.
 *
 * The boot check proves a subscription credential is present, not that it
 * is still valid: that takes a model call. A revoked or mistyped token fails
 * the first call instead, and the exchange records the CLI's own reason.
 */
export const MODEL_PROVIDER_HELP =
  'the quality loop runs only on a Claude Code subscription login: run `claude login` on this machine, or give a container the CLAUDE_CODE_OAUTH_TOKEN that `claude setup-token` prints';

export class MissingModelProviderError extends Error {
  override readonly name = 'MissingModelProvider';

  /** `found` is what the check saw instead of a subscription; `cause` a check that could not finish. */
  constructor(detail: { found?: string; cause?: unknown } = {}) {
    super(
      detail.cause !== undefined
        ? `could not check the Claude Code login (${detail.cause instanceof Error ? detail.cause.message : String(detail.cause)}) — ${MODEL_PROVIDER_HELP}`
        : `found no subscription login${detail.found ? ` (Claude Code reports ${detail.found})` : ''} — ${MODEL_PROVIDER_HELP}`,
    );
  }
}

/** The model report a boot announces: the pinned `LLM_MODEL`, else the subscription's label. */
export const describeModelProvider = (env: NodeJS.ProcessEnv = process.env): LlmModelDto => ({
  model: env['LLM_MODEL'] || SUBSCRIPTION_MODEL_LABEL,
});

/**
 * Refuse unless Claude Code reports the subscription. The account is asked
 * of the CLI itself, so a Keychain login and an OAuth token are recognised
 * alike; a check that cannot finish is a refusal too, with its own reason.
 */
export async function assertSubscriptionLogin(
  read: () => Promise<ClaudeAccount> = () => readClaudeAccount(),
): Promise<void> {
  let account: ClaudeAccount;
  try {
    account = await read();
  } catch (cause) {
    throw new MissingModelProviderError({ cause });
  }
  if (!signedIn(account)) throw new MissingModelProviderError({ found: describeAccount(account) });
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
