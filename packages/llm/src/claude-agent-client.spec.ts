import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ClaudeQuery } from './claude-account';
import { ClaudeAgentLlmClient, extractStructured } from './claude-agent-client';
import type { LlmCall } from './exchange';

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

/** A stand-in for the SDK's `query` that replays messages (then optionally throws, as the real SDK does on a non-zero exit) and records the options it got. */
function scripted(messages: readonly unknown[], thenThrow?: Error) {
  const seen: { env?: NodeJS.ProcessEnv } = {};
  const run = ((params: { options?: { env?: NodeJS.ProcessEnv } }) => {
    seen.env = params.options?.env;
    return (async function* () {
      yield* messages;
      if (thenThrow) throw thenThrow;
    })();
  }) as unknown as ClaudeQuery;
  return { run, seen };
}

const answer = z.object({ answer: z.string() });

describe('the subscription client at its call site', () => {
  it('[QL-22] spawns the CLI with no non-subscription credential in its environment', async () => {
    const saved = {
      key: process.env['ANTHROPIC_API_KEY'],
      token: process.env['ANTHROPIC_AUTH_TOKEN'],
    };
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'gateway';
    try {
      const { run, seen } = scripted([
        { type: 'result', subtype: 'success', is_error: false, result: '{"answer":"ok"}' },
      ]);
      const client = new ClaudeAgentLlmClient({ query: run });
      await expect(
        client.completeStructured({ system: 's', user: 'u', schema: answer }),
      ).resolves.toEqual({ answer: 'ok' });
      expect(seen.env).not.toHaveProperty('ANTHROPIC_API_KEY');
      expect(seen.env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
      expect(seen.env).toHaveProperty('CLAUDE_CODE_MAX_OUTPUT_TOKENS');
    } finally {
      for (const [name, value] of [
        ['ANTHROPIC_API_KEY', saved.key],
        ['ANTHROPIC_AUTH_TOKEN', saved.token],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("[QL-22] a turn that ended on an API error is recorded as an error with the CLI's own reason", async () => {
    const calls: LlmCall[] = [];
    const { run } = scripted([
      { type: 'assistant', error: 'authentication_failed', message: { content: [] } },
      { type: 'result', subtype: 'success', is_error: true, result: 'Invalid bearer token' },
    ]);
    const client = new ClaudeAgentLlmClient({ query: run }).withRecorder((call) =>
      calls.push(call),
    );
    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: answer }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      outcome: 'error',
      error: { name: 'authentication_failed', message: 'Invalid bearer token' },
    });

    // The real SDK throws on the CLI's exit code after an error result; the result still wins.
    const exiting = scripted(
      [
        { type: 'assistant', error: 'authentication_failed', message: { content: [] } },
        { type: 'result', subtype: 'success', is_error: true, result: 'Invalid bearer token' },
      ],
      new Error('Claude Code returned an error result: Invalid bearer token'),
    );
    const afterExit: LlmCall[] = [];
    await new ClaudeAgentLlmClient({ query: exiting.run })
      .withRecorder((call) => afterExit.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(afterExit[0]).toMatchObject({
      outcome: 'error',
      error: { name: 'authentication_failed', message: 'Invalid bearer token' },
    });

    const stopped = scripted([
      { type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['turn limit'] },
    ]);
    const more: LlmCall[] = [];
    await new ClaudeAgentLlmClient({ query: stopped.run })
      .withRecorder((call) => more.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(more[0]).toMatchObject({
      outcome: 'error',
      error: { name: 'error_max_turns', message: 'turn limit' },
    });
  });
});
