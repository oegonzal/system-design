import { describe, expect, it } from 'vitest';

import { signedIn, subscriptionEnv, type ClaudeAccount } from './claude-account';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  assertSubscriptionLogin,
  createEmbeddingClientFromEnv,
  createQualityLoopLlmFromEnv,
  describeModelProvider,
  MissingModelProviderError,
} from './create-client';
import { DisabledEmbeddingClient, embeddingAvailability } from './embedding-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

const account = (overrides: Partial<ClaudeAccount>): ClaudeAccount => ({
  subscriptionType: null,
  tokenSource: null,
  ...overrides,
});

describe('the quality loop runs on the Claude Code subscription only', () => {
  it('[QL-22] every environment gets the subscription client, and an API key changes nothing', () => {
    expect(createQualityLoopLlmFromEnv({})).toBeInstanceOf(ClaudeAgentLlmClient);
    const withKey = createQualityLoopLlmFromEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    expect(withKey).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(withKey.model).toBe('claude-code/subscription');
    expect(describeModelProvider({ ANTHROPIC_API_KEY: 'sk-test' })).toEqual({
      model: 'claude-code/subscription',
    });
  });

  it('[QL-22] LLM_MODEL pins the model and the report; nothing else is read', () => {
    const env = { LLM_MODEL: 'claude-opus-5' };
    expect(createQualityLoopLlmFromEnv(env).model).toBe('claude-opus-5');
    expect(describeModelProvider(env)).toEqual({ model: 'claude-opus-5' });
  });

  it('[QL-22] an API key never reaches the CLI; everything else does', () => {
    const env = subscriptionEnv({
      ANTHROPIC_API_KEY: 'sk-test',
      HOME: '/h',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
    });
    expect(env).toEqual({ HOME: '/h', CLAUDE_CODE_OAUTH_TOKEN: 't' });
  });

  it('[QL-22] a machine login or an OAuth token counts as signed in; the source "none" does not', () => {
    expect(signedIn(account({ subscriptionType: 'Claude Max' }))).toBe(true);
    expect(signedIn(account({ tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN' }))).toBe(true);
    expect(signedIn(account({ tokenSource: 'none' }))).toBe(false);
    expect(signedIn(account({}))).toBe(false);
  });

  it('[QL-22] the login check refuses with how to get a login, and a check that cannot finish is a refusal too', async () => {
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ subscriptionType: 'Claude Max' }))),
    ).resolves.toBeUndefined();
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ tokenSource: 'none' }))),
    ).rejects.toThrow(MissingModelProviderError);
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ tokenSource: 'none' }))),
    ).rejects.toThrow(/claude login.*claude setup-token/);
    await expect(
      assertSubscriptionLogin(() => Promise.reject(new Error('CLI exited'))),
    ).rejects.toThrow(/the login check failed: CLI exited/);
  });
});

describe('embeddings stay optional', () => {
  it('an OpenAI key enables them; without one they are disabled with the reason', () => {
    expect(createEmbeddingClientFromEnv({ OPENAI_API_KEY: 'k' })).toBeInstanceOf(
      OpenAiEmbeddingClient,
    );
    const disabled = createEmbeddingClientFromEnv({});
    expect(disabled).toBeInstanceOf(DisabledEmbeddingClient);
    expect(embeddingAvailability(disabled)).toMatchObject({ enabled: false, reason: 'no-key' });
  });
});
