import { describe, expect, it } from 'vitest';

import type { ClaudeAccount } from './claude-account';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  assertModelProvider,
  assertSubscriptionLogin,
  createEmbeddingClientFromEnv,
  createQualityLoopLlm,
  describeModelProvider,
  PROVIDERS,
} from './create-client';
import { llmConfigSchema, LLM_PROVIDERS, type LlmConfig } from './llm-config';
import { OpenAiCompatibleLlmClient } from './openai-compatible-client';
import { DisabledEmbeddingClient, embeddingAvailability } from './embedding-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

const account = (overrides: Partial<ClaudeAccount>): ClaudeAccount => ({
  apiProvider: 'firstParty',
  subscriptionType: null,
  tokenSource: null,
  apiKeySource: null,
  ...overrides,
});

describe('the configured provider is the one that is built, and the one that is checked', () => {
  const config = (overrides: Partial<LlmConfig> = {}): LlmConfig =>
    llmConfigSchema.parse({ provider: 'claude-subscription', ...overrides });

  it('[QL-22] a checkout that names nothing runs on the subscription, as every run before the file existed did', () => {
    expect(createQualityLoopLlm(config(), {})).toBeInstanceOf(ClaudeAgentLlmClient);
    // An Anthropic key is still not a way in: the subscription provider does not read one.
    const withKey = createQualityLoopLlm(config(), { ANTHROPIC_API_KEY: 'sk-test' });
    expect(withKey).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(withKey.model).toBe('claude-code/subscription');
    expect(describeModelProvider(config())).toEqual({ model: 'claude-code/subscription' });
  });

  it('[QL-22] the file names the provider, and the client and the report follow it', () => {
    const openai = config({
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      apiKeyVar: 'OPENAI_API_KEY',
    });
    expect(createQualityLoopLlm(openai, { OPENAI_API_KEY: 'k' })).toBeInstanceOf(
      OpenAiCompatibleLlmClient,
    );
    expect(createQualityLoopLlm(openai, { OPENAI_API_KEY: 'k' }).model).toBe('gpt-4o-mini');
    expect(describeModelProvider(openai)).toEqual({ model: 'gpt-4o-mini' });
    // A pinned model reaches the subscription client too.
    expect(createQualityLoopLlm(config({ model: 'claude-opus-5' }), {}).model).toBe(
      'claude-opus-5',
    );
  });

  it('[QL-22] every declared provider has a check, and each one answers for itself', async () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...LLM_PROVIDERS].sort());

    // A key the file names and the environment does not hold is refused before
    // boot, saying which variable — not "run claude login", which would be the
    // wrong way out of an OpenAI problem.
    const openai = config({ provider: 'openai-compatible', apiKeyVar: 'OPENAI_API_KEY' });
    await expect(assertModelProvider(openai, {})).rejects.toThrow(/OPENAI_API_KEY is unset/);
    await expect(assertModelProvider(openai, {})).rejects.not.toThrow(/claude login/);
    await expect(assertModelProvider(openai, { OPENAI_API_KEY: 'k' })).resolves.toBeUndefined();

    // An endpoint that wants no key at all is ready as it stands.
    await expect(
      assertModelProvider(config({ provider: 'openai-compatible' }), {}),
    ).resolves.toBeUndefined();
  });

  it('[QL-22] the login check refuses what is not the subscription, saying what it found and how to get a login', async () => {
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ subscriptionType: 'Claude Max' }))),
    ).resolves.toBeUndefined();
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ tokenSource: 'none' }))),
    ).rejects.toThrow(
      /no model provider \(provider firstParty, token source none\).*claude login.*claude setup-token/,
    );
  });

  it('[QL-22] a check that cannot finish is a refusal with its own reason, not "no provider"', async () => {
    await expect(
      assertSubscriptionLogin(() => Promise.reject(new Error('CLI exited'))),
    ).rejects.toThrow(/could not check the model provider \(CLI exited\)/);
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
