import { describe, expect, it } from 'vitest';

import { AnthropicLlmClient } from './anthropic-client';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import {
  createEmbeddingClientFromEnv,
  createEvalLlmFromEnv,
  createImproverLlmFromEnv,
  createLlmClientFromEnv,
  createQualityLoopLlmFromEnv,
  embeddingAvailabilityFromEnv,
  qualityLoopAvailabilityFromEnv,
} from './create-client';
import { NoopEmbeddingClient } from './embedding-client';
import { NoopLlmClient } from './noop-client';
import { OpenAiEmbeddingClient } from './openai-embedding-client';

describe('createLlmClientFromEnv', () => {
  it('returns the no-op client when no key is configured', () => {
    const client = createLlmClientFromEnv({});
    expect(client).toBeInstanceOf(NoopLlmClient);
    expect(client.enabled).toBe(false);
    expect(client.model).toBeNull();
  });

  it('EVAL_DETERMINISTIC=1 outranks a present key', () => {
    const client = createLlmClientFromEnv({
      ANTHROPIC_API_KEY: 'sk-test',
      EVAL_DETERMINISTIC: '1',
    });
    expect(client).toBeInstanceOf(NoopLlmClient);
  });

  it('builds the real client with the default model when a key is present', () => {
    const client = createLlmClientFromEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
    expect(client.enabled).toBe(true);
    expect(client.model).toBe('claude-sonnet-5');
  });

  it('honours LLM_MODEL', () => {
    const client = createLlmClientFromEnv({
      ANTHROPIC_API_KEY: 'sk-test',
      LLM_MODEL: 'claude-opus-5',
    });
    expect(client.model).toBe('claude-opus-5');
  });

  it('no-op client resolves null without touching the network', async () => {
    const client = new NoopLlmClient();
    const { z } = await import('zod');
    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: z.object({}) }),
    ).resolves.toBeNull();
  });
});

describe('createEvalLlmFromEnv', () => {
  it('EVAL_DETERMINISTIC=1 outranks a key AND claude-code — grading stays reproducible', () => {
    expect(
      createEvalLlmFromEnv({ EVAL_DETERMINISTIC: '1', ANTHROPIC_API_KEY: 'sk-test' }),
    ).toBeInstanceOf(NoopLlmClient);
    expect(
      createEvalLlmFromEnv({ EVAL_DETERMINISTIC: '1', EVAL_AUTH: 'claude-code' }),
    ).toBeInstanceOf(NoopLlmClient);
  });

  it('a key builds the real client; it outranks the claude-code route', () => {
    const client = createEvalLlmFromEnv({ ANTHROPIC_API_KEY: 'sk-test', EVAL_AUTH: 'claude-code' });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
    expect(client.enabled).toBe(true);
  });

  it('EVAL_AUTH=claude-code enables the subscription client with no key', () => {
    const client = createEvalLlmFromEnv({ EVAL_AUTH: 'claude-code' });
    expect(client).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(client.enabled).toBe(true);
  });

  it('no key and no opt-in stays no-op — the default, byte-identical to before', () => {
    expect(createEvalLlmFromEnv({})).toBeInstanceOf(NoopLlmClient);
  });
});

describe('role factories', () => {
  it('the improver falls back to EVAL_DETERMINISTIC and overrides it with its own switch', () => {
    expect(
      createImproverLlmFromEnv({ EVAL_DETERMINISTIC: '1', IMPROVER_AUTH: 'claude-code' }),
    ).toBeInstanceOf(NoopLlmClient);
    expect(
      createImproverLlmFromEnv({
        EVAL_DETERMINISTIC: '1',
        IMPROVER_DETERMINISTIC: '0',
        IMPROVER_AUTH: 'claude-code',
      }),
    ).toBeInstanceOf(ClaudeAgentLlmClient);
  });

  it("the quality loop reads its own switch and auth route, never the improver's", () => {
    expect(
      createQualityLoopLlmFromEnv({ EVAL_DETERMINISTIC: '1', QUALITY_LOOP_AUTH: 'claude-code' }),
    ).toBeInstanceOf(NoopLlmClient);
    expect(
      createQualityLoopLlmFromEnv({
        EVAL_DETERMINISTIC: '1',
        QUALITY_LOOP_DETERMINISTIC: '0',
        QUALITY_LOOP_AUTH: 'claude-code',
      }),
    ).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(
      createQualityLoopLlmFromEnv({ IMPROVER_DETERMINISTIC: '0', IMPROVER_AUTH: 'claude-code' }),
    ).toBeInstanceOf(NoopLlmClient);
  });

  it("a key outranks the quality loop's claude-code route", () => {
    const client = createQualityLoopLlmFromEnv({
      ANTHROPIC_API_KEY: 'sk-test',
      QUALITY_LOOP_AUTH: 'claude-code',
    });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
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
      createEmbeddingClientFromEnv({ OPENAI_API_KEY: 'k', EVAL_DETERMINISTIC: '1' }),
    ).toBeInstanceOf(NoopEmbeddingClient);
    expect(
      createEmbeddingClientFromEnv({
        OPENAI_API_KEY: 'k',
        EVAL_DETERMINISTIC: '1',
        QUALITY_LOOP_DETERMINISTIC: '0',
      }),
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
