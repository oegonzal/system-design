import { describe, expect, it } from 'vitest';

import { AnthropicLlmClient } from './anthropic-client';
import { ClaudeAgentLlmClient } from './claude-agent-client';
import { createEvalLlmFromEnv, createLlmClientFromEnv } from './create-client';
import { NoopLlmClient } from './noop-client';

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
