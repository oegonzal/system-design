import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * How this process is signed in to Claude Code, as the Agent SDK's own CLI
 * reports it — asked over its control channel, before any message is sent,
 * so no model call is made and no credential passes through this code.
 *
 * A machine login answers with its subscription; a container given
 * `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) answers with that
 * token as its source; neither answers with the source `none`.
 */
export interface ClaudeAccount {
  subscriptionType: string | null;
  tokenSource: string | null;
}

/** The SDK's value for "no token found", and how long the CLI gets to say so. */
const NO_TOKEN_SOURCE = 'none';
const ACCOUNT_TIMEOUT_MS = 30_000;

/**
 * The environment the CLI runs under. The loop runs on the subscription only,
 * so an API key in the environment is withheld: the CLI would otherwise bill
 * it instead of the login.
 */
export function subscriptionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY: _withheld, ...rest } = env;
  return rest;
}

export const signedIn = (account: ClaudeAccount): boolean =>
  account.subscriptionType !== null ||
  (account.tokenSource !== null && account.tokenSource !== NO_TOKEN_SOURCE);

export async function readClaudeAccount(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ClaudeAccount> {
  const abort = new AbortController();
  // Streaming input that never sends a message: the CLI starts, answers
  // control requests, and is stopped before a turn could begin.
  const idle: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<SDKUserMessage>>((resolve) =>
          abort.signal.addEventListener('abort', () => resolve({ done: true, value: undefined })),
        ),
    }),
  };
  const timer = setTimeout(() => abort.abort(), ACCOUNT_TIMEOUT_MS);
  try {
    const session = query({
      prompt: idle,
      options: { abortController: abort, settingSources: [], env: subscriptionEnv(env) },
    });
    const info = await session.accountInfo();
    return {
      subscriptionType: info.subscriptionType ?? null,
      tokenSource: info.tokenSource ?? null,
    };
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
