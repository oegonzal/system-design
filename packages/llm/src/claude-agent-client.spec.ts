import {
  BINDING_CLAIM_BOUND,
  bound,
  bounded,
  CUT_MARKER,
  designSubmissionSchema,
  NARRATION_OVERVIEW_BOUND,
  NODE_CONFIG_STRING_VALUE_BOUND,
  RESPONSIBILITY_BOUND,
  SOFT_ISSUE_NOTE,
  type Bound,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ClaudeQuery } from './claude-account';
import {
  ClaudeAgentLlmClient,
  extractStructured,
  FEEDBACK_HEADING,
  jsonCandidates,
  OUTPUT_TOKEN_CEILING,
  parseStructured,
  PREVIOUS_REPLY_HEADING,
  SALVAGED,
  SCHEMA_MISS,
  TIMED_OUT,
} from './claude-agent-client';
import type { LlmCall } from './exchange';
import coach185832p2 from './fixtures/canvas-coach-18-58-32-p2.json';
import coach185832p3 from './fixtures/canvas-coach-18-58-32-p3.json';
import coach215319p1 from './fixtures/canvas-coach-21-53-19-p1.json';
import coach215319p2 from './fixtures/canvas-coach-21-53-19-p2.json';
import coach215319p3 from './fixtures/canvas-coach-21-53-19-p3.json';
import { InFlightGate } from './in-flight-gate';
import { DEFAULT_RETRY_POLICY } from './llm-failure';

/** A client that does not retry, for the specs that are about one call's record. */
const ONCE = { ...DEFAULT_RETRY_POLICY, attempts: 1 };

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

  it('[QL-59] keeps a string past its bound whole and records it, and cuts only an extreme one — at a word, with the marker', () => {
    // A bound is a target and a ceiling: 200 asked, 250 accepted, 600 the cut.
    const capped = z.object({ summary: bounded.text(bound(200)) });
    const words = (count: number) => 'word '.repeat(count).trim();

    const within = words(44); // 219: past the target, within the ceiling
    expect(parseStructured(JSON.stringify({ summary: within }), capped)).toMatchObject({
      ok: true,
      value: { summary: within },
      overruns: [{ path: 'summary', target: 200, ceiling: 250, actual: 219, handling: 'accepted' }],
      repairs: [],
    });

    const over = words(80); // 399: past the ceiling, under three targets
    expect(parseStructured(JSON.stringify({ summary: over }), capped)).toMatchObject({
      ok: true,
      value: { summary: over },
      overruns: [{ path: 'summary', actual: 399, handling: 'kept-over-ceiling' }],
    });

    const extreme = words(200); // 999: past three targets
    const cut = parseStructured(JSON.stringify({ summary: extreme }), capped);
    expect(cut).toMatchObject({
      ok: true,
      value: { summary: `${words(120)}${CUT_MARKER}` },
      overruns: [{ path: 'summary', actual: 999, handling: 'cut' }],
    });
  });

  it('[QL-4] says why there is no object: nothing parsed, or what each parsed candidate got wrong', () => {
    // The tail of a reply cut mid-object: braces that never balance from the top.
    const tail = '"id":"n-3","kind":"service"}],"edges":[]}}';
    expect(parseStructured(tail, schema)).toEqual({
      ok: false,
      reason: 'no complete JSON object in the reply (0 candidate span(s), none parsed)',
      issues: [],
    });

    const two = parseStructured('{"answer":"a"} then {"score":1}', schema);
    expect(two.ok).toBe(false);
    if (!two.ok) {
      expect(two.reason).toContain('candidate 1: score: ');
      expect(two.reason).toContain('candidate 2: answer: ');
      // The faults the next ask is told: the closest candidate's, the first on a tie.
      expect(two.issues).toMatchObject([{ path: 'score', soft: false }]);
    }

    // A fenced object is also a brace span: one candidate, one miss — not two.
    const fenced = '```json\n{"answer":"a"}\n```';
    expect(jsonCandidates(fenced)).toEqual(['{"answer":"a"}\n']);
    const once = parseStructured(fenced, schema);
    expect(once.ok).toBe(false);
    if (!once.ok)
      expect(once.reason).toBe('score: Invalid input: expected number, received undefined');
  });

  it('[QL-59] refuses a structural fault with every fault named, the soft ones noted, not refused', () => {
    const capped = z.strictObject({
      summary: bounded.text(bound(200)),
      kind: z.enum(['service', 'queue']),
    });
    const over = 'word '.repeat(80).trim();
    const miss = parseStructured(JSON.stringify({ summary: over, kind: 'bus' }), capped);
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.reason).toBe(
        `summary: 399 characters; 200 asked, 250 accepted ${SOFT_ISSUE_NOTE}; kind: Invalid option: expected one of "service"|"queue"`,
      );
      expect(miss.issues.map((issue) => [issue.path, issue.soft])).toEqual([
        ['summary', true],
        ['kind', false],
      ]);
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

/**
 * The canvas coach replies two recorded runs threw away whole (static/runs,
 * 2026-10-02T21-53-19 producer 1–3 and 2026-10-02T18-58-32 producer 2–3):
 * each a complete revision of 30–40k output tokens, each refused because a
 * string or two ran 1–19% past the bound it was shown. The objects are the
 * replies as written, unfenced; `overran` is every field the old parse named,
 * with what it wrote and the bound that field declares now. Measured, three
 * of those targets now sit above what the coach writes (`pnpm
 * measure:bounds`), so a field is an overrun only while it is past the target
 * it is asked for today — and every one is within its ceiling.
 */
const RECORDED_COACH_LOSSES: readonly [string, unknown, Record<string, [number, Bound]>][] = [
  [
    '21-53-19 producer 1',
    coach215319p1,
    {
      'graph.nodes[2].responsibilities[1]': [87, RESPONSIBILITY_BOUND],
      'graph.nodes[2].responsibilities[2]': [89, RESPONSIBILITY_BOUND],
    },
  ],
  ['21-53-19 producer 2', coach215319p2, { 'brief.bindings[1].claim': [358, BINDING_CLAIM_BOUND] }],
  [
    '21-53-19 producer 3',
    coach215319p3,
    { 'narrative.overview': [1438, NARRATION_OVERVIEW_BOUND] },
  ],
  [
    '18-58-32 producer 2',
    coach185832p2,
    {
      'graph.nodes[2].config[3].value': [141, NODE_CONFIG_STRING_VALUE_BOUND],
      'graph.nodes[5].config[3].value': [126, NODE_CONFIG_STRING_VALUE_BOUND],
      'graph.nodes[2].responsibilities[0]': [81, RESPONSIBILITY_BOUND],
    },
  ],
  [
    '18-58-32 producer 3',
    coach185832p3,
    {
      'brief.bindings[1].claim': [320, BINDING_CLAIM_BOUND],
      'brief.bindings[2].claim': [304, BINDING_CLAIM_BOUND],
      'brief.bindings[4].claim': [326, BINDING_CLAIM_BOUND],
      'narrative.overview': [1472, NARRATION_OVERVIEW_BOUND],
    },
  ],
];

/** The value at a located path, read off the reply as written. */
const at = (value: unknown, path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], value);

describe('the recorded coach losses, replayed', () => {
  it.each(RECORDED_COACH_LOSSES)(
    '[QL-59] %s, refused whole before, now parses with every overrun recorded and nothing cut',
    (_, reply, overran) => {
      // Fenced, as the model wrote it.
      const text = ['```json', JSON.stringify(reply), '```'].join('\n');
      const read = parseStructured(text, designSubmissionSchema);
      expect(read.ok).toBe(true);
      if (!read.ok) return;

      const stillOver = Object.entries(overran).filter(([, [written, b]]) => written > b.target);
      expect(
        Object.fromEntries(
          read.overruns.map((overrun) => [overrun.path, [overrun.actual, overrun.target]]),
        ),
      ).toEqual(
        Object.fromEntries(stillOver.map(([path, [written, b]]) => [path, [written, b.target]])),
      );
      // All within the ceiling: accepted as written, not one word cut.
      for (const [written, b] of Object.values(overran))
        expect(written).toBeLessThanOrEqual(b.ceiling);
      expect(read.overruns.every((overrun) => overrun.handling === 'accepted')).toBe(true);
      expect(read.repairs).toEqual([]);
      for (const overrun of read.overruns) {
        expect(at(read.value, overrun.at)).toBe(at(reply, overrun.at));
      }
    },
  );
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

describe('a call that failed once', () => {
  const good = '{"answer":"hi"}';
  const bad = '{"answer":42}';

  /** A transport whose successive calls replay successive scripts. */
  const sequence = (scripts: readonly (readonly unknown[])[]) => {
    const prompts: string[] = [];
    let call = 0;
    const run = ((params: { prompt?: string; options?: Record<string, unknown> }) => {
      prompts.push(String(params.prompt ?? ''));
      const messages = scripts[Math.min(call++, scripts.length - 1)];
      return (async function* () {
        yield* messages;
      })();
    }) as unknown as ClaudeQuery;
    return { run, prompts, calls: () => call };
  };

  const errored = (error: string) => [
    said('m-1', '', { error }),
    { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [error] },
  ];

  it("[QL-28] [QL-59] a schema miss is asked again at once, both attempts are on the record, and the second ask names the first's faults", async () => {
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded(bad)], [succeeded(good)]]);
    const answered = await new ClaudeAgentLlmClient({ query: script.run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toEqual({ answer: 'hi' });
    expect(calls.map((call) => [call.attempt, call.outcome])).toEqual([
      [1, 'schema-miss'],
      [2, 'ok'],
    ]);
    // The second ask names the first's faults, after the output format, with
    // the refused reply as written — a correction, not another independent draw.
    expect(script.prompts[1]).toBe(
      `${script.prompts[0]}\n\n${FEEDBACK_HEADING}\n- answer: Invalid input: expected string, received number\n\n${PREVIOUS_REPLY_HEADING}\n${bad}`,
    );
    expect(calls.map((call) => call.salvage?.feedback)).toEqual([false, true]);
    expect(calls[0]?.salvage?.issues).toMatchObject([{ path: 'answer', soft: false }]);
  });

  it('[QL-59] the second ask carries a small reply as written, and not a 160k-character one', async () => {
    // A key the schema ignores carries the bulk: the one fault is the same either way.
    const huge = JSON.stringify({ answer: 42, pad: 'x'.repeat(160_000) });
    const script = sequence([[succeeded(huge)], [succeeded(good)]]);
    await new ClaudeAgentLlmClient({ query: script.run }).completeStructured({
      system: 's',
      user: 'u',
      schema: answer,
    });
    expect(script.prompts[1]).toContain(FEEDBACK_HEADING);
    expect(script.prompts[1]).toContain(
      '- answer: Invalid input: expected string, received number',
    );
    expect(script.prompts[1]).not.toContain(PREVIOUS_REPLY_HEADING);
    expect(script.prompts[1].length).toBeLessThan(DEFAULT_RETRY_POLICY.feedback.replyMaxChars);

    // The policy can switch the feedback off: then the ask is the one it was.
    const silent = sequence([[succeeded(bad)], [succeeded(good)]]);
    await new ClaudeAgentLlmClient({
      query: silent.run,
      retry: { ...DEFAULT_RETRY_POLICY, feedback: { issues: false, replyMaxChars: 0 } },
    }).completeStructured({ system: 's', user: 'u', schema: answer });
    expect(silent.prompts[1]).toBe(silent.prompts[0]);
  });

  it('[QL-59] a soft overrun is kept on the first attempt and recorded, and never costs another', async () => {
    const bounded10 = z.object({ answer: bounded.text(bound(10)) });
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded('{"answer":"fourteen chars"}')]]);
    const answered = await new ClaudeAgentLlmClient({ query: script.run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: bounded10 });

    expect(answered).toEqual({ answer: 'fourteen chars' });
    expect(script.calls()).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      attempt: 1,
      outcome: 'ok',
      error: null,
      salvage: {
        from: 'result',
        feedback: false,
        issues: [],
        repairs: [],
        overruns: [{ path: 'answer', target: 10, ceiling: 50, actual: 14, handling: 'accepted' }],
      },
    });
    // The model was asked for the target; the schema it is parsed with accepts the ceiling.
    expect(calls[0]?.schema).toMatchObject({ properties: { answer: { maxLength: 10 } } });
  });

  it('[QL-59] a list past its ceiling is trimmed by whole items, and the record says what was dropped', async () => {
    // Two asked, four accepted (the floor); six written.
    const listed = z.object({ items: bounded.list(bound(2, 'list'), z.string()) });
    const calls: LlmCall[] = [];
    const six = JSON.stringify({ items: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const answered = await new ClaudeAgentLlmClient({ query: sequence([[succeeded(six)]]).run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: listed });

    expect(answered).toEqual({ items: ['a', 'b', 'c', 'd'] });
    expect(calls[0]?.salvage).toMatchObject({
      overruns: [
        {
          path: 'items',
          kind: 'list',
          target: 2,
          ceiling: 4,
          actual: 6,
          handling: 'trimmed',
          dropped: 2,
        },
      ],
      repairs: [{ path: 'items', action: 'trimmed', detail: '2 dropped' }],
    });
  });

  it('[QL-59] the detailed call reports the faults of the last refused reply, and every ask after the first carries feedback', async () => {
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded(bad)]]);
    const reply = await new ClaudeAgentLlmClient({
      query: script.run,
      sleep: async () => undefined,
    })
      .withRecorder((call) => calls.push(call))
      .completeStructuredDetailed({ system: 's', user: 'u', schema: answer });

    expect(reply).toMatchObject({
      value: null,
      overruns: [],
      issues: [{ path: 'answer', code: 'invalid_type', soft: false }],
    });
    expect(calls.map((call) => call.salvage?.feedback)).toEqual([false, true, true]);
    expect(script.prompts.slice(1).every((prompt) => prompt.includes(FEEDBACK_HEADING))).toBe(true);

    // An attempt that failed some other way leaves the refusal standing: the
    // next ask still names it, and the caller is handed it when attempts run out.
    const strained = sequence([[succeeded(bad)], errored('overloaded')]);
    const afterStrain = await new ClaudeAgentLlmClient({
      query: strained.run,
      sleep: async () => undefined,
    }).completeStructuredDetailed({ system: 's', user: 'u', schema: answer });
    expect(strained.calls()).toBe(DEFAULT_RETRY_POLICY.attempts);
    expect(strained.prompts[2]).toContain(FEEDBACK_HEADING);
    expect(afterStrain).toMatchObject({ value: null, issues: [{ path: 'answer', soft: false }] });

    // The one-method port is the same call's value, and a value carries its overruns.
    const detailed = await new ClaudeAgentLlmClient({
      query: sequence([[succeeded(good)]]).run,
    }).completeStructuredDetailed({ system: 's', user: 'u', schema: answer });
    expect(detailed).toEqual({ value: { answer: 'hi' }, issues: [], overruns: [] });
  });

  it('[QL-28] the first attempt stays visible, so the miss rate is still measurable', async () => {
    const calls: LlmCall[] = [];
    await new ClaudeAgentLlmClient({ query: sequence([[succeeded(bad)], [succeeded(good)]]).run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(calls[0]).toMatchObject({ attempt: 1, outcome: 'schema-miss', response: null });
    expect(calls.filter((call) => call.outcome === 'schema-miss')).toHaveLength(1);
  });

  it('[QL-28] a refused credential is never asked twice', async () => {
    const calls: LlmCall[] = [];
    const script = sequence([errored('authentication_failed')]);
    const answered = await new ClaudeAgentLlmClient({ query: script.run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toBeNull();
    // One ask, because a credential does not become valid in a second.
    expect(script.calls()).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('[QL-28] a strained provider is asked again, after waiting', async () => {
    const waits: number[] = [];
    const script = sequence([errored('overloaded'), [succeeded(good)]]);
    const answered = await new ClaudeAgentLlmClient({
      query: script.run,
      sleep: async (ms) => void waits.push(ms),
    }).completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toEqual({ answer: 'hi' });
    expect(waits).toEqual([DEFAULT_RETRY_POLICY.backoffMs]);
  });

  it('[QL-28] the attempts are bounded, and the last failure is reported honestly', async () => {
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded(bad)]]);
    const answered = await new ClaudeAgentLlmClient({
      query: script.run,
      sleep: async () => undefined,
    })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toBeNull();
    expect(script.calls()).toBe(DEFAULT_RETRY_POLICY.attempts);
    expect(calls.map((call) => call.attempt)).toEqual([1, 2, 3]);
    expect(calls.every((call) => call.outcome === 'schema-miss')).toBe(true);
  });

  it('[QL-28] each attempt takes its own permit rather than holding one across the wait', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const held: number[] = [];
    const script = sequence([errored('overloaded'), [succeeded(good)]]);
    await new ClaudeAgentLlmClient({
      query: script.run,
      gate,
      sleep: async () => void held.push(gate.snapshot().inFlight),
    }).completeStructured({ system: 's', user: 'u', schema: answer });

    // Nothing is in flight while we wait out a strained provider.
    expect(held).toEqual([0]);
  });
});

describe('the subscription client under the process gate', () => {
  const ok = [{ type: 'result', subtype: 'success', is_error: false, result: '{"answer":"hi"}' }];

  it('[QL-27] holds one permit for the span of a call and frees it afterwards', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const inside: number[] = [];
    const { run } = scripted(ok);
    const client = new ClaudeAgentLlmClient({
      query: run,
      gate,
      sink: () => inside.push(gate.snapshot().inFlight),
    });

    await client.completeStructured({ system: 's', user: 'u', schema: answer });
    expect(inside).toEqual([1]);
    expect(gate.snapshot()).toEqual({ ceiling: 1, inFlight: 0, waiting: 0 });
  });

  it('[QL-27] a wait for admission is recorded, never charged to the call', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const calls: LlmCall[] = [];
    const { run } = scripted(ok);
    const client = new ClaudeAgentLlmClient({ query: run, gate, sink: (call) => calls.push(call) });

    // One permit, two callers: the second cannot start until the first is done.
    await Promise.all([
      client.completeStructured({ system: 's', user: 'u', schema: answer }),
      client.completeStructured({ system: 's', user: 'u', schema: answer }),
    ]);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.outcome).toBe('ok');
      // Whatever it waited, the duration measures the model and nothing else.
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
      expect(call.queuedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('[QL-27] a recording twin shares the gate rather than opening a second ceiling', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const { run } = scripted(ok);
    const seen: number[] = [];
    const twin = new ClaudeAgentLlmClient({ query: run, gate }).withRecorder(() =>
      seen.push(gate.snapshot().inFlight),
    );

    await twin.completeStructured({ system: 's', user: 'u', schema: answer });
    expect(seen).toEqual([1]);
  });
});

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

/**
 * One streamed assistant frame: a single text block, top-level, as the CLI
 * emits it. `call` is the API message id the frame belongs to — one per API
 * call, shared by every block that call streamed; the frame's own by default.
 */
const said = (
  uuid: string,
  text: string,
  extra: Record<string, unknown> = {},
  call: string = uuid,
) => ({
  type: 'assistant',
  uuid,
  parent_tool_use_id: null,
  message: { id: call, content: [{ type: 'text', text }], stop_reason: null },
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

describe('the subscription client under its time limit', () => {
  /** Milliseconds, not minutes: a token a millisecond, no overhead or minimum, a short grace. */
  const fast = { overheadMs: 0, floorTokensPerSecond: 1_000, minimumMs: 0, graceMs: 40 };
  const clock = { tickMs: 2 };

  /** A stream that says nothing, and ends only as `ending` does — or never. */
  const silentUntil = (ending: Promise<never>): AsyncIterable<never> => ({
    [Symbol.asyncIterator]: () => ({ next: () => ending }),
  });

  /** A turn that writes nothing until it is aborted, then dies as the SDK reports an abort: a plain Error. */
  const wedged = () => {
    let calls = 0;
    const run = ((params: { options?: { abortController?: AbortController } }) => {
      calls += 1;
      const signal = params.options?.abortController?.signal;
      return silentUntil(
        new Promise<never>((_, reject) =>
          signal?.addEventListener('abort', () =>
            reject(new Error('Claude Code process aborted by user')),
          ),
        ),
      );
    }) as unknown as ClaudeQuery;
    return { run, calls: () => calls };
  };

  it('[QL-33] a turn our abort ended is a timeout, however the SDK names its error, and is asked again once — not twice', async () => {
    const recorded: LlmCall[] = [];
    const turn = wedged();
    const answered = await new ClaudeAgentLlmClient({ query: turn.run, limits: fast, clock })
      .withRecorder((call) => recorded.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 20 });

    expect(answered).toBeNull();
    expect(turn.calls()).toBe(DEFAULT_RETRY_POLICY.timeoutAttempts);
    expect(recorded.map((call) => [call.attempt, call.outcome, call.error?.name])).toEqual([
      [1, 'error', TIMED_OUT],
      [2, 'error', TIMED_OUT],
    ]);
    // The record says which limit, from what the call declared.
    expect(recorded[0]?.error?.message).toContain('20 declared tokens');
    expect(recorded[0]?.error?.message).toContain('process aborted by user');
  });

  it('[QL-59] a turn our limit ended answers ok, salvaged, when what it streamed holds the whole object', async () => {
    // The object arrives, then the stream hangs until the abort kills it.
    const spoke = ((params: { options?: { abortController?: AbortController } }) => {
      const signal = params.options?.abortController?.signal;
      return (async function* () {
        yield said('m-1', '{"answer":"whole"}');
        await new Promise<never>((_, reject) =>
          signal?.addEventListener('abort', () =>
            reject(new Error('Claude Code process aborted by user')),
          ),
        );
      })();
    }) as unknown as ClaudeQuery;
    const recorded: LlmCall[] = [];
    const answered = await new ClaudeAgentLlmClient({ query: spoke, limits: fast, clock })
      .withRecorder((call) => recorded.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 20 });

    expect(answered).toEqual({ answer: 'whole' });
    // One attempt: the value was read, so there was nothing to ask again.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      outcome: 'ok',
      response: { answer: 'whole' },
      text: '{"answer":"whole"}',
      error: { name: SALVAGED, message: expect.stringContaining(`${TIMED_OUT}: no answer within`) },
      salvage: { from: 'transcript', overruns: [], issues: [] },
      apiCalls: 1,
    });
  });

  it('[QL-33] a turn that ignores its abort is abandoned a grace after its limit, never awaited past it', async () => {
    const recorded: LlmCall[] = [];
    const deaf = (() => silentUntil(new Promise<never>(() => undefined))) as unknown as ClaudeQuery;
    const began = Date.now();
    const answered = await new ClaudeAgentLlmClient({
      query: deaf,
      limits: fast,
      clock,
      retry: ONCE,
    })
      .withRecorder((call) => recorded.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 20 });

    expect(answered).toBeNull();
    // Its limit (20 ms) and grace (40 ms), with room for the ticks — not forever.
    expect(Date.now() - began).toBeLessThan(1_000);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      outcome: 'error',
      error: { name: TIMED_OUT, message: expect.stringContaining('did not end') },
    });
  });

  it('[QL-33] the limit is what the call declares: the same slow answer fits a large declaration and not a small one', async () => {
    // An answer that takes 60 ms: a 1,000-token declaration is a second, a 10-token one is 10 ms.
    const slow = ((params: { options?: { abortController?: AbortController } }) => {
      const signal = params.options?.abortController?.signal;
      return (async function* () {
        await new Promise((wake) => setTimeout(wake, 60));
        if (signal?.aborted) throw new Error('Claude Code process aborted by user');
        yield succeeded('{"answer":"slow"}');
      })();
    }) as unknown as ClaudeQuery;
    const client = new ClaudeAgentLlmClient({ query: slow, limits: fast, clock, retry: ONCE });

    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 1_000 }),
    ).resolves.toEqual({ answer: 'slow' });
    await expect(
      client.completeStructured({ system: 's', user: 'u', schema: answer, maxTokens: 10 }),
    ).resolves.toBeNull();
  });
});
