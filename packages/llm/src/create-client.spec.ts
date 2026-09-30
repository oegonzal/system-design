import { describe, expect, it } from 'vitest';

import { AnthropicLlmClient } from './anthropic-client';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  createEmbeddingClientFromEnv,
  createQualityLoopLlmFromEnv,
  describeModelProvider,
  MissingModelProviderError,
} from './create-client';
import { DisabledEmbeddingClient, embeddingAvailability } from './embedding-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

describe("the quality loop's model client", () => {
  it('[QL-22] refuses to build a client when nothing is configured, naming both variables', () => {
    expect(() => createQualityLoopLlmFromEnv({})).toThrow(MissingModelProviderError);
    expect(() => createQualityLoopLlmFromEnv({})).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => createQualityLoopLlmFromEnv({})).toThrow(/QUALITY_LOOP_AUTH=claude-code/);
    expect(() => describeModelProvider({})).toThrow(MissingModelProviderError);
  });

  it('[QL-22] no longer reads a determinism switch: a key with it set still builds the real client', () => {
    expect(
      createQualityLoopLlmFromEnv({
        QUALITY_LOOP_DETERMINISTIC: '1',
        ANTHROPIC_API_KEY: 'sk-test',
      }),
    ).toBeInstanceOf(AnthropicLlmClient);
    expect(
      createQualityLoopLlmFromEnv({
        QUALITY_LOOP_DETERMINISTIC: '1',
        QUALITY_LOOP_AUTH: 'claude-code',
      }),
    ).toBeInstanceOf(ClaudeAgentLlmClient);
  });

  it('a key builds the real client with the default model, honours LLM_MODEL, and outranks claude-code', () => {
    const client = createQualityLoopLlmFromEnv({
      ANTHROPIC_API_KEY: 'sk-test',
      QUALITY_LOOP_AUTH: 'claude-code',
    });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
    expect(client.model).toBe('claude-sonnet-5');
    expect(
      createQualityLoopLlmFromEnv({ ANTHROPIC_API_KEY: 'sk-test', LLM_MODEL: 'claude-opus-5' })
        .model,
    ).toBe('claude-opus-5');
  });

  it('QUALITY_LOOP_AUTH=claude-code enables the subscription client with no key', () => {
    expect(createQualityLoopLlmFromEnv({ QUALITY_LOOP_AUTH: 'claude-code' })).toBeInstanceOf(
      ClaudeAgentLlmClient,
    );
  });

  it("reads only its own switches: another role's variables are not its business", () => {
    expect(
      createQualityLoopLlmFromEnv({ EVAL_DETERMINISTIC: '1', QUALITY_LOOP_AUTH: 'claude-code' }),
    ).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(() =>
      createQualityLoopLlmFromEnv({ OTHER_DETERMINISTIC: '0', OTHER_AUTH: 'claude-code' }),
    ).toThrow(MissingModelProviderError);
  });

  it('[QL-22] the model report names the model a boot would announce, never the key', () => {
    expect(describeModelProvider({ QUALITY_LOOP_AUTH: 'claude-code' })).toEqual({
      model: 'claude-code/subscription',
    });
    expect(describeModelProvider({ ANTHROPIC_API_KEY: 'sk-test' })).toEqual({
      model: 'claude-sonnet-5',
    });
    expect(
      describeModelProvider({ ANTHROPIC_API_KEY: 'sk-test', LLM_MODEL: 'claude-opus-5' }),
    ).toEqual({
      model: 'claude-opus-5',
    });
    expect(JSON.stringify(describeModelProvider({ ANTHROPIC_API_KEY: 'sk-test' }))).not.toContain(
      'sk-test',
    );
  });
});

describe('createEmbeddingClientFromEnv', () => {
  it('[QL-18] no key yields a disabled client that carries its reason; a key yields OpenAI — never reading OPENAI_MODEL', () => {
    const off = createEmbeddingClientFromEnv({ OPENAI_MODEL: 'gpt-x' });
    expect(off).toBeInstanceOf(DisabledEmbeddingClient);
    expect(off.enabled).toBe(false);
    expect(off.reason).toBe('no-key');
    expect(off.dimensions).toBe(0);
    expect(embeddingAvailability(off)).toEqual({ enabled: false, model: null, reason: 'no-key' });

    const on = createEmbeddingClientFromEnv({ OPENAI_API_KEY: 'k', OPENAI_MODEL: 'gpt-x' });
    expect(on).toBeInstanceOf(OpenAiEmbeddingClient);
    expect(on.model).toBe('text-embedding-3-small');
    expect(on.dimensions).toBe(1536);
    expect(embeddingAvailability(on)).toEqual({
      enabled: true,
      model: 'text-embedding-3-small',
      reason: null,
    });

    const custom = createEmbeddingClientFromEnv({
      OPENAI_API_KEY: 'k',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large',
    });
    expect(custom.model).toBe('text-embedding-3-large');
  });

  it('[QL-18] no longer follows a determinism switch: a key with it set still builds OpenAI', () => {
    expect(
      createEmbeddingClientFromEnv({ OPENAI_API_KEY: 'k', QUALITY_LOOP_DETERMINISTIC: '1' }),
    ).toBeInstanceOf(OpenAiEmbeddingClient);
  });
});
