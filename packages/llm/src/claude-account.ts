import { query as sdkQuery, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * How this process is signed in to Claude Code, as the Agent SDK's own CLI
 * reports it — asked over its control channel, before any message is sent,
 * so no model call is made and no credential passes through this code.
 *
 * A machine login answers with its subscription; a container given
 * `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) answers with that
 * token as its source. Anything else — no credential, an API key, a
 * gateway token, a key helper, a third-party provider — is not the
 * subscription, and the loop refuses to run on it.
 */
export interface ClaudeAccount {
  apiProvider: string | null;
  subscriptionType: string | null;
  tokenSource: string | null;
  apiKeySource: string | null;
}

/** The Agent SDK's `query`, injectable so a spec never spawns the CLI. */
export type ClaudeQuery = typeof sdkQuery;

/** The one provider the subscription is billed through. */
export const SUBSCRIPTION_PROVIDER = 'firstParty';

/** Token sources that are the subscription's own `claude setup-token` token. */
export const SUBSCRIPTION_TOKEN_SOURCES: readonly string[] = [
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
];

/**
 * Credentials the CLI would authenticate with instead of the subscription —
 * withheld from every process it is spawned as, so a key left in a shell or
 * a `.env` can never be billed.
 */
export const NON_SUBSCRIPTION_CREDENTIALS: readonly string[] = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
];

export const ACCOUNT_CHECK_TIMEOUT_MS = 30_000;

export class AccountCheckTimeout extends Error {
  override readonly name = 'AccountCheckTimeout';

  constructor(timeoutMs: number) {
    super(`Claude Code did not report its account within ${timeoutMs / 1000}s`);
  }
}

/** The environment every Claude Code process runs under: this one, minus non-subscription credentials. */
export function subscriptionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !NON_SUBSCRIPTION_CREDENTIALS.includes(name)),
  );
}

/**
 * The subscription, and only the subscription: the first-party provider, no
 * API key source, and either the machine login (a subscription with no
 * token source) or a setup-token token.
 */
export const signedIn = (account: ClaudeAccount): boolean =>
  account.apiProvider === SUBSCRIPTION_PROVIDER &&
  account.apiKeySource === null &&
  (account.tokenSource === null
    ? account.subscriptionType !== null
    : SUBSCRIPTION_TOKEN_SOURCES.includes(account.tokenSource));

/** What the account check found, in words that name no credential. */
export const describeAccount = (account: ClaudeAccount): string =>
  `provider ${account.apiProvider ?? 'unknown'}, token source ${account.tokenSource ?? 'none'}` +
  (account.apiKeySource ? `, API key source ${account.apiKeySource}` : '');

export async function readClaudeAccount(
  env: NodeJS.ProcessEnv = process.env,
  run: ClaudeQuery = sdkQuery,
  timeoutMs: number = ACCOUNT_CHECK_TIMEOUT_MS,
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AccountCheckTimeout(timeoutMs)), timeoutMs);
  });
  try {
    const session = run({
      prompt: idle,
      options: { abortController: abort, settingSources: [], env: subscriptionEnv(env) },
    });
    const info = await Promise.race([session.accountInfo(), timeout]);
    return {
      apiProvider: info.apiProvider ?? null,
      subscriptionType: info.subscriptionType ?? null,
      tokenSource: info.tokenSource ?? null,
      apiKeySource: info.apiKeySource ?? null,
    };
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
