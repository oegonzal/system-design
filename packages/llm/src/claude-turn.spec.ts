import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ClaudeAgentLlmClient } from './claude-agent-client';
import { answer, ONCE, said, scripted, succeeded } from './testing';
import { OUTPUT_TOKEN_CEILING } from './claude-turn';
import type { LlmCall } from './exchange';
import { SALVAGED, SCHEMA_MISS } from './structured-reply';

/** One spawned turn: what it is spawned with, and how what it streams is read — whole, whatever ended it. */
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

  it("[QL-22] spawns a declared effort as the CLI's own effort level, and leaves it to the CLI when none is declared", async () => {
    const ok = () => [
      { type: 'result', subtype: 'success', is_error: false, result: '{"answer":"ok"}' },
    ];
    const eased = scripted(ok());
    await new ClaudeAgentLlmClient({ query: eased.run }).completeStructured({
      system: 's',
      user: 'u',
      schema: answer,
      effort: 'medium',
    });
    expect(eased.seen.options?.['effort']).toBe('medium');
    expect(eased.seen.options).not.toHaveProperty('thinking');

    const free = scripted(ok());
    await new ClaudeAgentLlmClient({ query: free.run }).completeStructured({
      system: 's',
      user: 'u',
      schema: answer,
    });
    expect(free.seen.options).not.toHaveProperty('effort');
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
      // The resume was a second API call, and the record says so.
      apiCalls: 2,
    });
  });

  it('[QL-10] records why a reply missed the schema, so the dump says which fault refused it or that nothing parsed', async () => {
    const calls: LlmCall[] = [];
    const record = (call: LlmCall) => calls.push(call);
    const cut = scripted([said('m-1', '"id":"n-2"}]}'), succeeded('"id":"n-2"}]}')]);
    await new ClaudeAgentLlmClient({ query: cut.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: graph });
    expect(calls[0]).toMatchObject({
      outcome: 'schema-miss',
      response: null,
      error: { name: SCHEMA_MISS, message: expect.stringContaining('no complete JSON object') },
    });

    const wrong = JSON.stringify({ answer: ['not', 'a', 'string'] });
    const over = scripted([said('m-1', wrong), succeeded(wrong)]);
    await new ClaudeAgentLlmClient({ query: over.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(calls[1]).toMatchObject({
      outcome: 'schema-miss',
      text: wrong,
      error: { name: SCHEMA_MISS, message: expect.stringMatching(/^answer: /) },
      salvage: { from: null, issues: [{ path: 'answer', soft: false }] },
      apiCalls: 1,
    });
  });

  it('[QL-59] counts the API calls a turn took: one per message id, however many blocks each streamed', async () => {
    const calls: LlmCall[] = [];
    const record = (call: LlmCall) => calls.push(call);
    // Two blocks of one call share a message id; a resume is a second call.
    const resumed = scripted([
      said('m-1a', '{"nodes":[', { error: 'max_output_tokens' }, 'msg-1'),
      said('m-1b', '{"id":"n-1","kind":"client"}],', {}, 'msg-1'),
      said('m-2', '"edges":[]}', {}, 'msg-2'),
      succeeded('"edges":[]}'),
    ]);
    await new ClaudeAgentLlmClient({ query: resumed.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: graph });
    expect(calls[0]).toMatchObject({
      outcome: 'ok',
      response: { nodes: [{ id: 'n-1', kind: 'client' }], edges: [] },
      apiCalls: 2,
    });

    const single = scripted([said('m-1', '{"answer":"hi"}'), succeeded('{"answer":"hi"}')]);
    await new ClaudeAgentLlmClient({ query: single.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(calls[1]?.apiCalls).toBe(1);
  });

  it('[QL-59] a turn that ended without a result is still read, and answers when its transcript holds the whole object', async () => {
    const calls: LlmCall[] = [];
    const record = (call: LlmCall) => calls.push(call);
    // The CLI wrote the object, then the turn ended on an error result.
    const errored = scripted([
      said('m-1', '{"answer":"whole"}'),
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['lost'] },
    ]);
    const answered = await new ClaudeAgentLlmClient({ query: errored.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(answered).toEqual({ answer: 'whole' });
    expect(calls[0]).toMatchObject({
      outcome: 'ok',
      response: { answer: 'whole' },
      error: { name: SALVAGED, message: 'error_during_execution: lost' },
      salvage: { from: 'transcript', issues: [] },
    });

    // The same when the model ran out of output and the turn ended on it.
    const exhausted = scripted([
      said('m-1', '{"answer":"whole"}', { error: 'max_output_tokens' }),
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['cut'] },
    ]);
    await new ClaudeAgentLlmClient({ query: exhausted.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(calls.at(-1)).toMatchObject({
      outcome: 'ok',
      error: { name: SALVAGED, message: 'max_output_tokens: cut' },
      salvage: { from: 'transcript' },
    });

    // The same when the stream broke before any result.
    const broke = scripted([said('m-1', '{"answer":"whole"}')], new Error('pipe closed'));
    await new ClaudeAgentLlmClient({ query: broke.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(calls.at(-1)).toMatchObject({
      outcome: 'ok',
      error: { name: SALVAGED, message: 'Error: pipe closed' },
      salvage: { from: 'transcript' },
    });

    // A transcript that holds no whole object is the error it was, with the partial text kept.
    const partial = scripted([said('m-1', '{"answer":"cut')], new Error('pipe closed'));
    const nothing = await new ClaudeAgentLlmClient({ query: partial.run, retry: ONCE })
      .withRecorder(record)
      .completeStructured({ system: 's', user: 'u', schema: answer });
    expect(nothing).toBeNull();
    expect(calls.at(-1)).toMatchObject({
      outcome: 'error',
      text: '{"answer":"cut',
      error: { name: 'Error', message: 'pipe closed' },
      salvage: { from: null, issues: [] },
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
