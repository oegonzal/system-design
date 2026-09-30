import { describe, expect, it } from 'vitest';

import { AnthropicLlmClient } from './anthropic-client';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  createEmbeddingClientFromEnv,
  createQualityLoopLlmFromEnv,
  embeddingAvailabilityFromEnv,
  qualityLoopAvailabilityFromEnv,
} from './create-client';
import { NoopEmbeddingClient } from './embedding-client';
import { NoopLlmClient } from './noop-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

describe("the quality loop's model client", () => {
  it('is the no-op client when nothing is configured, and it resolves null without touching the network', async () => {
    const client = createQualityLoopLlmFromEnv({});
    expect(client).toBeInstanceOf(NoopLlmClient);
    expect(client.enabled).toBe(false);
    expect(client.model).toBeNull();
    const { z } = await import('zod');
    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: z.object({}) }),
    ).resolves.toBeNull();
  });

  it('QUALITY_LOOP_DETERMINISTIC=1 outranks a key and the claude-code route alike', () => {
    expect(
      createQualityLoopLlmFromEnv({
        QUALITY_LOOP_DETERMINISTIC: '1',
        ANTHROPIC_API_KEY: 'sk-test',
      }),
    ).toBeInstanceOf(NoopLlmClient);
    expect(
      createQualityLoopLlmFromEnv({
        QUALITY_LOOP_DETERMINISTIC: '1',
        QUALITY_LOOP_AUTH: 'claude-code',
      }),
    ).toBeInstanceOf(NoopLlmClient);
  });

  it('a key builds the real client with the default model, honours LLM_MODEL, and outranks claude-code', () => {
    const client = createQualityLoopLlmFromEnv({
      ANTHROPIC_API_KEY: 'sk-test',
      QUALITY_LOOP_AUTH: 'claude-code',
    });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
    expect(client.enabled).toBe(true);
    expect(client.model).toBe('claude-sonnet-5');
    expect(
      createQualityLoopLlmFromEnv({ ANTHROPIC_API_KEY: 'sk-test', LLM_MODEL: 'claude-opus-5' })
        .model,
    ).toBe('claude-opus-5');
  });

  it('QUALITY_LOOP_AUTH=claude-code enables the subscription client with no key', () => {
    const client = createQualityLoopLlmFromEnv({ QUALITY_LOOP_AUTH: 'claude-code' });
    expect(client).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(client.enabled).toBe(true);
  });

  it("reads only its own switches: another role's variables are not its business", () => {
    expect(
      createQualityLoopLlmFromEnv({ EVAL_DETERMINISTIC: '1', QUALITY_LOOP_AUTH: 'claude-code' }),
    ).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(
      createQualityLoopLlmFromEnv({ OTHER_DETERMINISTIC: '0', OTHER_AUTH: 'claude-code' }),
    ).toBeInstanceOf(NoopLlmClient);
  });

  it('availability reports the reason the model is off, never the key', () => {
    expect(qualityLoopAvailabilityFromEnv({})).toEqual({
      enabled: false,
      model: null,
      reason: 'no-key',
    });
    expect(qualityLoopAvailabilityFromEnv({ QUALITY_LOOP_DETERMINISTIC: '1' })).toEqual({
      enabled: false,
      model: null,
      reason: 'deterministic',
    });
    expect(qualityLoopAvailabilityFromEnv({ QUALITY_LOOP_AUTH: 'claude-code' })).toEqual({
      enabled: true,
      model: 'claude-code/subscription',
      reason: null,
    });
    expect(qualityLoopAvailabilityFromEnv({ ANTHROPIC_API_KEY: 'sk-test' })).toEqual({
      enabled: true,
      model: 'claude-sonnet-5',
      reason: null,
    });
  });
});

describe('createEmbeddingClientFromEnv', () => {
  it('[QL-18] yields the no-op without a key, and the OpenAI client with one — never reading OPENAI_MODEL', () => {
    const off = createEmbeddingClientFromEnv({ OPENAI_MODEL: 'gpt-x' });
    expect(off).toBeInstanceOf(NoopEmbeddingClient);
    expect(off.enabled).toBe(false);
    expect(off.dimensions).toBe(0);

    const on = createEmbeddingClientFromEnv({ OPENAI_API_KEY: 'k', OPENAI_MODEL: 'gpt-x' });
    expect(on).toBeInstanceOf(OpenAiEmbeddingClient);
    expect(on.model).toBe('text-embedding-3-small');
    expect(on.dimensions).toBe(1536);

    const custom = createEmbeddingClientFromEnv({
      OPENAI_API_KEY: 'k',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large',
    });
    expect(custom.model).toBe('text-embedding-3-large');
  });

  it("[QL-18] follows the quality loop's determinism switch, and reports why it is off without the key", () => {
    expect(
      createEmbeddingClientFromEnv({ OPENAI_API_KEY: 'k', QUALITY_LOOP_DETERMINISTIC: '1' }),
    ).toBeInstanceOf(NoopEmbeddingClient);
    expect(
      createEmbeddingClientFromEnv({ OPENAI_API_KEY: 'k', QUALITY_LOOP_DETERMINISTIC: '0' }),
    ).toBeInstanceOf(OpenAiEmbeddingClient);

    expect(embeddingAvailabilityFromEnv({})).toEqual({
      enabled: false,
      model: null,
      reason: 'no-key',
    });
    expect(
      embeddingAvailabilityFromEnv({ OPENAI_API_KEY: 'k', QUALITY_LOOP_DETERMINISTIC: '1' }),
    ).toEqual({
      enabled: false,
      model: null,
      reason: 'deterministic',
    });
    expect(embeddingAvailabilityFromEnv({ OPENAI_API_KEY: 'k' })).toEqual({
      enabled: true,
      model: 'text-embedding-3-small',
      reason: null,
    });
  });
});
