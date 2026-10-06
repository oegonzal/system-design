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
