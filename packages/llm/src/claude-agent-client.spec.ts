import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ClaudeAgentLlmClient, extractStructured } from './claude-agent-client';
import { createQualityLoopLlmFromEnv, describeModelProvider } from './create-client';

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

  it('finds the valid object past a schema echo the agent quoted (the real failure mode)', () => {
    // The prompt embeds the JSON Schema; a chatty agent echoes it, then answers.
    // First-brace-to-last-brace would sweep both and fail — the scan must not.
    const text =
      'The schema {"type":"object","properties":{"answer":{"type":"string"}}} asks for a string.\n' +
      'Here is my answer: {"answer":"real","score":9}';
    expect(extractStructured(text, schema)).toEqual({ answer: 'real', score: 9 });
  });

  it('clamps a length overshoot to its cap instead of losing the whole answer', () => {
    // No server-side constraint on this route: a model shown `.max(10)` still
    // writes twelve characters, and a 900-char summary must not sink a pass.
    const capped = z.object({
      summary: z.string().max(10),
      items: z.array(z.object({ note: z.string().max(4) })).max(1),
    });
    const text = JSON.stringify({
      summary: 'twelve chars',
      items: [{ note: 'toolong' }, { note: 'dropped' }],
    });
    expect(extractStructured(text, capped)).toEqual({
      summary: 'twelve cha',
      items: [{ note: 'tool' }],
    });
  });

  it('strips a key the schema never asked for instead of losing the whole answer', () => {
    const schema = z.strictObject({
      flows: z.array(z.strictObject({ name: z.string(), steps: z.array(z.string().max(20)) })),
    });
    const text = JSON.stringify({
      flows: [
        {
          name: 'read',
          steps: ['load the page', 'a step far longer than twenty chars'],
          steps_note: 'aside',
        },
      ],
    });

    expect(extractStructured(text, schema)).toEqual({
      flows: [{ name: 'read', steps: ['load the page', 'a step far longer th'] }],
    });
  });

  it('does not clamp its way past a real schema miss', () => {
    const capped = z.object({ summary: z.string().max(10), score: z.number() });
    expect(extractStructured('{"summary":"twelve chars","score":"nope"}', capped)).toBeNull();
  });

  it('skips a first fenced block that fails the schema and takes the second that passes', () => {
    const text =
      'Current brief:\n```json\n{"answer":"stale"}\n```\nProposal:\n```json\n{"answer":"new","score":3}\n```';
    expect(extractStructured(text, schema)?.answer).toBe('new');
  });

  it('ignores braces inside strings when scanning', () => {
    expect(extractStructured('{"answer":"has } and { braces","score":1}', schema)).toEqual({
      answer: 'has } and { braces',
      score: 1,
    });
  });
});

describe('claude-code subscription auth for the quality loop', () => {
  it('QUALITY_LOOP_AUTH=claude-code enables the agent client without any key', () => {
    const env = { QUALITY_LOOP_AUTH: 'claude-code' };
    const client = createQualityLoopLlmFromEnv(env);
    expect(client).toBeInstanceOf(ClaudeAgentLlmClient);
    expect(describeModelProvider(env)).toEqual({ model: 'claude-code/subscription' });
  });

  it('an explicit API key outranks claude-code auth', () => {
    const withKey = createQualityLoopLlmFromEnv({
      QUALITY_LOOP_AUTH: 'claude-code',
      ANTHROPIC_API_KEY: 'sk-test',
    });
    expect(withKey).not.toBeInstanceOf(ClaudeAgentLlmClient);
    expect(withKey.model).toBe('claude-sonnet-5');
  });

  it('LLM_MODEL pins the agent model and the availability label', () => {
    const env = { QUALITY_LOOP_AUTH: 'claude-code', LLM_MODEL: 'claude-opus-5' };
    expect(createQualityLoopLlmFromEnv(env).model).toBe('claude-opus-5');
    expect(describeModelProvider(env).model).toBe('claude-opus-5');
  });
});
