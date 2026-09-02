import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ClaudeAgentLlmClient, extractStructured } from './claude-agent-client';
import { createImproverLlmFromEnv, improverAvailabilityFromEnv } from './create-client';
import { NoopLlmClient } from './noop-client';

const schema = z.object({ answer: z.string(), score: z.number().int() });

describe('extractStructured', () => {
  it('parses a bare JSON object', () => {
    expect(extractStructured('{"answer":"a","score":7}', schema)).toEqual({
      answer: 'a',
      score: 7,
    });
  });

  it('prefers a fenced block and survives surrounding prose', () => {
    const text = 'Here you go:\n```json\n{"answer":"fenced","score":1}\n```\nDone.';
    expect(extractStructured(text, schema)?.answer).toBe('fenced');
  });

  it('falls back to the outermost brace span inside prose', () => {
    const text = 'The result is {"answer":"inline","score":2} as requested.';
    expect(extractStructured(text, schema)?.answer).toBe('inline');
  });

  it('returns null on junk and on schema misses — the deterministic path', () => {
    expect(extractStructured('no json here', schema)).toBeNull();
    expect(extractStructured('{"answer":"a","score":"not-a-number"}', schema)).toBeNull();
  });
});

describe('claude-code subscription auth for the improver', () => {
  it('IMPROVER_AUTH=claude-code enables the agent client without any key', () => {
    const env = { IMPROVER_DETERMINISTIC: '0', IMPROVER_AUTH: 'claude-code' };
    const client = createImproverLlmFromEnv(env);
    expect(client).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(client.enabled).toBe(true);
    expect(improverAvailabilityFromEnv(env)).toEqual({
      enabled: true,
      model: 'claude-code/subscription',
      reason: null,
    });
  });

  it('an explicit API key outranks claude-code auth; determinism outranks both', () => {
    const withKey = createImproverLlmFromEnv({
      IMPROVER_DETERMINISTIC: '0',
      IMPROVER_AUTH: 'claude-code',
      ANTHROPIC_API_KEY: 'sk-test',
    });
    expect(withKey).not.toBeInstanceOf(ClaudeAgentLlmClient);
    expect(withKey.enabled).toBe(true);

    const deterministic = createImproverLlmFromEnv({
      EVAL_DETERMINISTIC: '1',
      IMPROVER_AUTH: 'claude-code',
    });
    expect(deterministic).toBeInstanceOf(NoopLlmClient);
  });

  it('LLM_MODEL pins the agent model and the availability label', () => {
    const env = {
      IMPROVER_DETERMINISTIC: '0',
      IMPROVER_AUTH: 'claude-code',
      LLM_MODEL: 'claude-opus-5',
    };
    expect(createImproverLlmFromEnv(env).model).toBe('claude-opus-5');
    expect(improverAvailabilityFromEnv(env).model).toBe('claude-opus-5');
  });
});
