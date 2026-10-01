import { describe, expect, it } from 'vitest';

import type { ClaudeAccount } from './claude-account';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  assertSubscriptionLogin,
  createEmbeddingClientFromEnv,
  createQualityLoopLlmFromEnv,
  describeModelProvider,
  IN_FLIGHT_VAR,
  maxInFlight,
  MissingModelProviderError,
} from './create-client';
import { DisabledEmbeddingClient, embeddingAvailability } from './embedding-client';
import { DEFAULT_GATE_POLICY } from './in-flight-gate';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

const account = (overrides: Partial<ClaudeAccount>): ClaudeAccount => ({
  apiProvider: 'firstParty',
  subscriptionType: null,
  tokenSource: null,
  apiKeySource: null,
  ...overrides,
});

describe('the process ceiling', () => {
  it('[QL-27] defaults when unset and refuses anything but a positive integer, by name', () => {
    expect(maxInFlight({})).toBe(DEFAULT_GATE_POLICY.ceiling);
    expect(maxInFlight({ [IN_FLIGHT_VAR]: '' })).toBe(DEFAULT_GATE_POLICY.ceiling);
    expect(maxInFlight({ [IN_FLIGHT_VAR]: '3' })).toBe(3);

    for (const bad of ['0', '-2', '2.5', 'lots']) {
      expect(() => maxInFlight({ [IN_FLIGHT_VAR]: bad })).toThrow(IN_FLIGHT_VAR);
    }
  });
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

  it('[QL-22] the login check refuses what is not the subscription, saying what it found and how to get a login', async () => {
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ subscriptionType: 'Claude Max' }))),
    ).resolves.toBeUndefined();
    const none = assertSubscriptionLogin(() => Promise.resolve(account({ tokenSource: 'none' })));
    await expect(none).rejects.toThrow(MissingModelProviderError);
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ tokenSource: 'none' }))),
    ).rejects.toThrow(
      /found no subscription login \(Claude Code reports provider firstParty, token source none\).*claude login.*claude setup-token/,
    );
    await expect(
      assertSubscriptionLogin(() =>
        Promise.resolve(account({ tokenSource: 'ANTHROPIC_AUTH_TOKEN' })),
      ),
    ).rejects.toThrow(/token source ANTHROPIC_AUTH_TOKEN/);
  });

  it('[QL-22] a check that cannot finish is a refusal with its own reason, not "no login"', async () => {
    const failed = assertSubscriptionLogin(() => Promise.reject(new Error('CLI exited')));
    await expect(failed).rejects.toThrow(/could not check the Claude Code login \(CLI exited\)/);
    await expect(
      assertSubscriptionLogin(() => Promise.reject(new Error('CLI exited'))),
    ).rejects.not.toThrow(/found no subscription login/);
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
