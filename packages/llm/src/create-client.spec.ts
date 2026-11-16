import { describe, expect, it } from 'vitest';

import type { ClaudeAccount } from './claude-account';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  assertBedrockLogin,
  assertModelProvider,
  assertSubscriptionLogin,
  BEDROCK_PROVIDER_HELP,
  createEmbeddingClientFromEnv,
  createQualityLoopLlm,
  describeModelProvider,
  PROVIDERS,
  providerEnv,
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

  it('[QL-22] the Bedrock row turns the file into the CLI’s environment, pins its model, and accepts only a CLI on Bedrock without an API key', async () => {
    const bedrock = config({
      provider: 'claude-bedrock',
      model: 'us.anthropic.claude-sonnet-4-6',
      smallModel: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      region: 'us-east-1',
    });
    // The names are the vendor's, the values the file's: the task environment
    // carries no model choice.
    expect(providerEnv(bedrock)).toEqual({
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_REGION: 'us-east-1',
      ANTHROPIC_MODEL: 'us.anthropic.claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    });
    const noSmall = config({
      provider: 'claude-bedrock',
      model: 'us.anthropic.claude-sonnet-4-6',
      region: 'us-east-1',
    });
    expect(providerEnv(noSmall)).not.toHaveProperty('ANTHROPIC_DEFAULT_HAIKU_MODEL');
    expect(providerEnv(config())).toEqual({});
    expect(providerEnv(config({ provider: 'openai-compatible' }))).toEqual({});

    const client = createQualityLoopLlm(bedrock, {});
    expect(client).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(client.model).toBe('us.anthropic.claude-sonnet-4-6');
    expect(describeModelProvider(bedrock)).toEqual({ model: 'us.anthropic.claude-sonnet-4-6' });

    await expect(
      assertBedrockLogin(() => Promise.resolve(account({ apiProvider: 'bedrock' }))),
    ).resolves.toBeUndefined();
    // The subscription is not Bedrock, and the way out is Bedrock's own, not `claude login`.
    const onSubscription = () => Promise.resolve(account({ subscriptionType: 'Claude Max' }));
    await expect(assertBedrockLogin(onSubscription)).rejects.toThrow(
      /no model provider \(provider firstParty, token source none\).*bedrock:InvokeModel/,
    );
    await expect(assertBedrockLogin(onSubscription)).rejects.not.toThrow(/claude login/);
    await expect(assertBedrockLogin(onSubscription)).rejects.toThrow(BEDROCK_PROVIDER_HELP);
    await expect(
      assertBedrockLogin(() =>
        Promise.resolve(account({ apiProvider: 'bedrock', apiKeySource: 'ANTHROPIC_API_KEY' })),
      ),
    ).rejects.toThrow(/API key source ANTHROPIC_API_KEY/);
    await expect(
      assertBedrockLogin(() => Promise.reject(new Error('no AWS credentials'))),
    ).rejects.toThrow(
      /could not check the model provider \(no AWS credentials\).*AWS credentials the default SDK chain/,
    );
    // And the subscription row still refuses a CLI on Bedrock: this machine stays where it is.
    await expect(
      assertSubscriptionLogin(() => Promise.resolve(account({ apiProvider: 'bedrock' }))),
    ).rejects.toThrow(/provider bedrock.*claude login/);
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
