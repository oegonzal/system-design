import { describe, expect, it } from 'vitest';

import {
  AccountCheckTimeout,
  readClaudeAccount,
  signedIn,
  subscriptionEnv,
  type ClaudeAccount,
  type ClaudeQuery,
} from './claude-account';

const account = (overrides: Partial<ClaudeAccount>): ClaudeAccount => ({
  apiProvider: 'firstParty',
  subscriptionType: null,
  tokenSource: null,
  apiKeySource: null,
  ...overrides,
});

/** A stand-in for the SDK's `query`: records what it was given and answers `accountInfo` as told. */
function fakeQuery(answer: () => Promise<unknown>) {
  const seen: { env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {};
  const run = ((params: {
    options?: { env?: NodeJS.ProcessEnv; abortController?: AbortController };
  }) => {
    seen.env = params.options?.env;
    seen.signal = params.options?.abortController?.signal;
    return { accountInfo: answer };
  }) as unknown as ClaudeQuery;
  return { run, seen };
}

describe('the subscription login check', () => {
  it('[QL-22] accepts the machine login and the setup-token token, and nothing else', () => {
    expect(signedIn(account({ subscriptionType: 'Claude Max' }))).toBe(true);
    expect(signedIn(account({ tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN' }))).toBe(true);
    expect(signedIn(account({ tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR' }))).toBe(
      true,
    );

    expect(signedIn(account({}))).toBe(false);
    expect(signedIn(account({ tokenSource: 'none' }))).toBe(false);
    // A gateway token, a key helper or an API key is billed outside the subscription.
    expect(signedIn(account({ tokenSource: 'ANTHROPIC_AUTH_TOKEN' }))).toBe(false);
    expect(signedIn(account({ tokenSource: 'apiKeyHelper' }))).toBe(false);
    expect(
      signedIn(account({ subscriptionType: 'Claude Max', apiKeySource: 'ANTHROPIC_API_KEY' })),
    ).toBe(false);
    expect(signedIn(account({ apiProvider: 'bedrock', subscriptionType: 'Claude Max' }))).toBe(
      false,
    );
    // A subscription reported beside a token source that is not the subscription's is not enough.
    expect(
      signedIn(account({ subscriptionType: 'Claude Max', tokenSource: 'ANTHROPIC_AUTH_TOKEN' })),
    ).toBe(false);
  });

  it('[QL-22] withholds every non-subscription credential from the CLI and keeps the rest', () => {
    expect(
      subscriptionEnv({
        ANTHROPIC_API_KEY: 'k',
        ANTHROPIC_AUTH_TOKEN: 't',
        CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR: '3',
        CLAUDE_CODE_OAUTH_TOKEN: 'o',
        HOME: '/h',
      }),
    ).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: 'o', HOME: '/h' });
  });

  it('[QL-22] asks the CLI under the withheld environment, maps absent fields to null, and stops it afterwards', async () => {
    const { run, seen } = fakeQuery(() =>
      Promise.resolve({ apiProvider: 'firstParty', subscriptionType: 'Claude Max' }),
    );
    const found = await readClaudeAccount({ ANTHROPIC_API_KEY: 'k', HOME: '/h' }, run);
    expect(found).toEqual({
      apiProvider: 'firstParty',
      subscriptionType: 'Claude Max',
      tokenSource: null,
      apiKeySource: null,
    });
    expect(seen.env).toEqual({ HOME: '/h' });
    expect(seen.signal?.aborted).toBe(true);
  });

  it('[QL-22] a CLI that fails or never answers is stopped, and the silence is named', async () => {
    const failing = fakeQuery(() => Promise.reject(new Error('CLI exited')));
    await expect(readClaudeAccount({}, failing.run)).rejects.toThrow('CLI exited');
    expect(failing.seen.signal?.aborted).toBe(true);

    const silent = fakeQuery(() => new Promise(() => undefined));
    await expect(readClaudeAccount({}, silent.run, 20)).rejects.toBeInstanceOf(AccountCheckTimeout);
    await expect(readClaudeAccount({}, silent.run, 20)).rejects.toThrow(/within 0.02s/);
    expect(silent.seen.signal?.aborted).toBe(true);
  });
});
