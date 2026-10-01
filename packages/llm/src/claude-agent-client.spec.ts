import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ClaudeQuery } from './claude-account';
import {
  ClaudeAgentLlmClient,
  extractStructured,
  OUTPUT_TOKEN_CEILING,
  parseStructured,
  SCHEMA_MISS,
} from './claude-agent-client';
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

  it('[QL-4] trims an array past its cap to whole items instead of losing the whole answer', () => {
    // No server-side constraint on this route: a model shown `.max(1)` still
    // writes two items, and the extra one is dropped whole — no word is cut.
    const capped = z.object({ items: z.array(z.object({ note: z.string() })).max(1) });
    const text = JSON.stringify({ items: [{ note: 'kept' }, { note: 'dropped' }] });
    expect(extractStructured(text, capped)).toEqual({ items: [{ note: 'kept' }] });
  });

  it('[QL-4] never cuts prose to fit a bound: an overlong string is a miss that names the bound', () => {
    const capped = z.object({ summary: z.string().max(10) });
    const text = JSON.stringify({ summary: 'twelve chars' });
    expect(extractStructured(text, capped)).toBeNull();
    const miss = parseStructured(text, capped);
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.reason).toMatch(/^summary: /);
      expect(miss.reason).toContain('10');
    }
  });

  it('[QL-4] says why there is no object: nothing parsed, or what each parsed candidate got wrong', () => {
    // The tail of a reply cut mid-object: braces that never balance from the top.
    const tail = '"id":"n-3","kind":"service"}],"edges":[]}}';
    expect(parseStructured(tail, schema)).toEqual({
      ok: false,
      reason: 'no complete JSON object in the reply (0 candidate span(s), none parsed)',
    });

    const two = parseStructured('{"answer":"a"} then {"score":1}', schema);
    expect(two.ok).toBe(false);
    if (!two.ok) {
      expect(two.reason).toContain('candidate 1: score: ');
      expect(two.reason).toContain('candidate 2: answer: ');
    }
  });

  it('strips a key the schema never asked for instead of losing the whole answer', () => {
    const schema = z.strictObject({
      flows: z.array(
        z.strictObject({ name: z.string(), steps: z.array(z.string().max(20)).max(1) }),
      ),
    });
    const text = JSON.stringify({
      flows: [{ name: 'read', steps: ['load the page', 'render it'], steps_note: 'aside' }],
    });

    expect(extractStructured(text, schema)).toEqual({
      flows: [{ name: 'read', steps: ['load the page'] }],
    });
  });

  it('does not trim its way past a real schema miss', () => {
    const capped = z.object({ items: z.array(z.string()).max(1), score: z.number() });
    expect(extractStructured('{"items":["a","b"],"score":"nope"}', capped)).toBeNull();
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
  const seen: { env?: NodeJS.ProcessEnv; options?: Record<string, unknown> } = {};
  const run = ((params: { options?: Record<string, unknown> & { env?: NodeJS.ProcessEnv } }) => {
    seen.env = params.options?.env;
    seen.options = params.options;
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
      expect(seen.env?.['CLAUDE_CODE_MAX_OUTPUT_TOKENS']).toBe(String(OUTPUT_TOKEN_CEILING));
      // Every built-in tool off by the SDK's own switch, not a list of names that goes stale.
      expect(seen.options?.['tools']).toEqual([]);
      expect(seen.options).not.toHaveProperty('disallowedTools');
      expect(seen.options).toMatchObject({ maxTurns: 1, settingSources: [] });
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

/** One streamed assistant frame: a single text block, top-level, as the CLI emits it. */
const said = (uuid: string, text: string, extra: Record<string, unknown> = {}) => ({
  type: 'assistant',
  uuid,
  parent_tool_use_id: null,
  message: { content: [{ type: 'text', text }], stop_reason: null },
  ...extra,
});

const succeeded = (result: string, usage = { input_tokens: 2, output_tokens: 10 }) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result,
  stop_reason: 'end_turn',
  usage,
});

describe('the subscription client reads the whole turn', () => {
  const graph = z.object({
    nodes: z.array(z.object({ id: z.string(), kind: z.string() })),
    edges: z.array(z.string()),
  });

  it('parses an answer the CLI resumed in a second message after the output cap', async () => {
    // The first API call stops at the cap mid-object; the CLI resumes it, and
    // `result` repeats only the second message — the tail, which never parses.
    const head = '{"nodes":[{"id":"n-1","kind":"client"},{';
    const tail = '"id":"n-2","kind":"service"}],"edges":["e-1"]}';
    const calls: LlmCall[] = [];
    const { run } = scripted([
      said('m-1', head, { error: 'max_output_tokens' }),
      said('m-2', tail),
      succeeded(tail, { input_tokens: 4, output_tokens: 21_122 }),
    ]);
    const client = new ClaudeAgentLlmClient({ query: run }).withRecorder((call) =>
      calls.push(call),
    );

    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: graph, maxTokens: 28_000 }),
    ).resolves.toEqual({
      nodes: [
        { id: 'n-1', kind: 'client' },
        { id: 'n-2', kind: 'service' },
      ],
      edges: ['e-1'],
    });
    expect(calls[0]).toMatchObject({
      outcome: 'ok',
      text: head + tail,
      error: null,
      stopReason: 'end_turn',
      maxTokens: 28_000,
      usage: { inputTokens: 4, outputTokens: 21_122 },
    });
  });

  it('[QL-10] records why a reply missed the schema, so the dump says which bound or that nothing parsed', async () => {
    const calls: LlmCall[] = [];
    const record = (call: LlmCall) => calls.push(call);
    const cut = scripted([said('m-1', '"id":"n-2"}]}'), succeeded('"id":"n-2"}]}')]);
    await new ClaudeAgentLlmClient({ query: cut.run })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: graph });
    expect(calls[0]).toMatchObject({
      outcome: 'schema-miss',
      response: null,
      error: { name: SCHEMA_MISS, message: expect.stringContaining('no complete JSON object') },
    });

    const long = JSON.stringify({ answer: 'far past the bound' });
    const over = scripted([said('m-1', long), succeeded(long)]);
    await new ClaudeAgentLlmClient({ query: over.run }).withRecorder(record).completeStructured({
      system: 's',
      user: 'u',
      schema: z.object({ answer: z.string().max(4) }),
    });
    expect(calls[1]).toMatchObject({
      outcome: 'schema-miss',
      text: long,
      error: { name: SCHEMA_MISS, message: expect.stringMatching(/^answer: /) },
    });
  });

  it('drops a message the CLI retracted, and falls back to the result when the stream holds no answer', async () => {
    const retracted = scripted([
      said('m-1', '{"answer":"refused leg"}'),
      said('m-2', '{"answer":"replacement"}', { supersedes: ['m-1'] }),
      succeeded('{"answer":"replacement"}'),
    ]);
    await expect(
      new ClaudeAgentLlmClient({ query: retracted.run }).completeStructured({
        system: 's',
        user: 'u',
        schema: answer,
      }),
    ).resolves.toEqual({ answer: 'replacement' });

    // A subagent's frame is not the turn's own text.
    const nested = scripted([
      said('m-1', 'thinking out loud', { parent_tool_use_id: 'tool-1' }),
      succeeded('{"answer":"from result"}'),
    ]);
    const calls: LlmCall[] = [];
    await expect(
      new ClaudeAgentLlmClient({ query: nested.run })
        .withRecorder((call) => calls.push(call))
        .completeStructured({ system: 's', user: 'u', schema: answer }),
    ).resolves.toEqual({ answer: 'from result' });
    expect(calls[0]?.text).toBe('{"answer":"from result"}');

    const unparseable = scripted([said('m-1', 'Done.'), succeeded('{"answer":"in result"}')]);
    await expect(
      new ClaudeAgentLlmClient({ query: unparseable.run }).completeStructured({
        system: 's',
        user: 'u',
        schema: answer,
      }),
    ).resolves.toEqual({ answer: 'in result' });
  });
});
