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

import coach185832p2 from './fixtures/canvas-coach-18-58-32-p2.json';
import coach185832p3 from './fixtures/canvas-coach-18-58-32-p3.json';
import coach215319p1 from './fixtures/canvas-coach-21-53-19-p1.json';
import coach215319p2 from './fixtures/canvas-coach-21-53-19-p2.json';
import coach215319p3 from './fixtures/canvas-coach-21-53-19-p3.json';
import { extractStructured, jsonCandidates, parseStructured } from './structured-reply';

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
