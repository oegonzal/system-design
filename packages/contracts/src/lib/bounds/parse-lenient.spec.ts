import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bound, CUT_FACTOR, CUT_MARKER, cutPoint, keptAtMost } from './bound';
import { bounded } from './bounded';
import {
  describeIssue,
  describeOverrun,
  overrunIssue,
  schemaIssuesOf,
  SOFT_ISSUE_NOTE,
} from './issues';
import { modelSchema } from './model-schema';
import { parseLenient } from './parse-lenient';

const CLAIM = bound(300);

/** Prose of whole words, so a cut can be checked for landing between two of them. */
const prose = (length: number): string => {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  let text = '';
  for (let index = 0; text.length < length; index++) text += `${words[index % words.length]} `;
  return text.slice(0, length);
};

describe('parseLenient', () => {
  const schema = z.strictObject({
    claim: bounded.text(CLAIM, { min: 1 }),
    severity: z.enum(['low', 'high']),
    nodeIds: bounded.list(bound(8, 'list'), bounded.id(8, { min: 1 })),
  });
  const valid = { claim: 'the API writes the order', severity: 'low', nodeIds: ['n1'] };

  it('[QL-58] keeps a 358/300 claim whole and records it as accepted', () => {
    const parsed = parseLenient(schema, { ...valid, claim: 'x'.repeat(358) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.claim).toHaveLength(358);
    expect(parsed.repairs).toEqual([]);
    expect(parsed.overruns).toEqual([
      expect.objectContaining({ path: 'claim', actual: 358, handling: 'accepted' }),
    ]);
  });

  it('[QL-58] keeps a claim past the ceiling whole, up to three targets, and records it', () => {
    const parsed = parseLenient(schema, { ...valid, claim: prose(700) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.claim).toBe(prose(700));
    expect(parsed.overruns).toEqual([
      {
        path: 'claim',
        at: ['claim'],
        kind: 'text',
        target: 300,
        ceiling: 375,
        actual: 700,
        handling: 'kept-over-ceiling',
      },
    ]);
  });

  it('[QL-58] cuts a 1,200/300 claim at a word boundary before three targets, with the marker', () => {
    const written = prose(1200);
    const parsed = parseLenient(schema, { ...valid, claim: written });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { claim } = parsed.value;
    expect(claim.endsWith(CUT_MARKER)).toBe(true);
    const kept = claim.slice(0, -CUT_MARKER.length);
    expect(kept.length).toBeLessThanOrEqual(CUT_FACTOR * CLAIM.target);
    // Ends on a whole word: the written text continues with a space there.
    expect(written.startsWith(kept)).toBe(true);
    expect(written[kept.length]).toBe(' ');
    expect(kept.endsWith(' ')).toBe(false);
    expect(parsed.overruns).toEqual([
      expect.objectContaining({ path: 'claim', actual: 1200, handling: 'cut' }),
    ]);
    // Parsed again, what was cut is kept as written: never cut twice.
    const again = parseLenient(schema, parsed.value);
    expect(again.ok && again.value).toEqual(parsed.value);
  });

  it('[QL-58] keeps a text whole up to keptAtMost and cuts past it to within a word of the cut point — a short target too', () => {
    for (const declared of [bound(10), bound(300)]) {
      const schema = z.strictObject({ text: bounded.text(declared) });
      expect(cutPoint(declared)).toBe(Math.max(CUT_FACTOR * declared.target, declared.ceiling));
      for (let length = declared.ceiling + 1; length <= 2 * keptAtMost(declared); length++) {
        const read = parseLenient(schema, { text: prose(length) });
        if (!read.ok) throw new Error(`refused at ${length}`);
        const kept = read.value.text;
        expect(kept.length).toBeLessThanOrEqual(keptAtMost(declared));
        if (length <= keptAtMost(declared)) expect(kept.length).toBe(length);
        else {
          expect(kept.endsWith(CUT_MARKER)).toBe(true);
          // A cut lands on the last word boundary before the cut point: never more than one word short of it.
          expect(kept.length - CUT_MARKER.length).toBeGreaterThan(
            cutPoint(declared) - 'epsilon '.length,
          );
        }
      }
    }
  });

  it('[QL-58] trims a 13-item list to its ceiling by whole items, worst-last, and records what it dropped', () => {
    const nodeIds = Array.from({ length: 13 }, (_, index) => `n${index + 1}`);
    const parsed = parseLenient(schema, { ...valid, nodeIds });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.nodeIds).toEqual(nodeIds.slice(0, 10));
    expect(parsed.repairs).toEqual([
      { path: 'nodeIds', at: ['nodeIds'], action: 'trimmed', detail: '3 dropped' },
    ]);
    expect(parsed.overruns).toEqual([
      {
        path: 'nodeIds',
        at: ['nodeIds'],
        kind: 'list',
        target: 8,
        ceiling: 10,
        actual: 13,
        handling: 'trimmed',
        dropped: 3,
      },
    ]);
  });

  it('[QL-58] strips an aside key the schema never asked for, and says so', () => {
    const parsed = parseLenient(schema, { ...valid, claim_note: 'an aside' });
    expect(parsed.ok && parsed.value).toEqual(valid);
    expect(parsed.repairs).toEqual([
      { path: '(root)', at: [], action: 'stripped-keys', detail: 'claim_note' },
    ]);
  });

  it('[QL-58] refuses a wrong enum value, with every fault named and the soft ones flagged', () => {
    const parsed = parseLenient(schema, { ...valid, claim: 'x'.repeat(400), severity: 'fatal' });
    expect(parsed.ok).toBe(false);
    expect(parsed.value).toBeNull();
    expect(parsed.issues.map((issue) => [issue.path, issue.code, issue.soft])).toEqual([
      ['claim', 'too_big', true],
      ['severity', 'invalid_value', false],
    ]);
    expect(parsed.issues.map(describeIssue)).toEqual([
      `claim: 400 characters; 300 asked, 375 accepted ${SOFT_ISSUE_NOTE}`,
      'severity: Invalid option: expected one of "low"|"high"',
    ]);
  });

  it('[QL-58] an id over its max is structural, never kept — and so is an empty required string', () => {
    const overlong = parseLenient(schema, { ...valid, nodeIds: ['n'.repeat(9)] });
    expect(overlong.ok).toBe(false);
    expect(overlong.issues).toEqual([
      expect.objectContaining({ path: 'nodeIds[0]', code: 'too_big', kind: 'id', soft: false }),
    ]);
    const empty = parseLenient(schema, { ...valid, claim: '' });
    expect(empty.ok).toBe(false);
    expect(empty.issues).toEqual([
      expect.objectContaining({ path: 'claim', code: 'too_small', soft: false }),
    ]);
  });

  it('[QL-58] keeps the union branch the reply meant when its only fault is soft', () => {
    const scalar = z.strictObject({ value: z.union([bounded.text(bound(120)), z.number()]) });
    const kept = parseLenient(scalar, { value: 'v'.repeat(200) });
    expect(kept.ok && kept.value).toEqual({ value: 'v'.repeat(200) });
    expect(kept.overruns).toEqual([
      expect.objectContaining({ path: 'value', actual: 200, handling: 'kept-over-ceiling' }),
    ]);

    const shapes = z.strictObject({
      part: z.union([
        z.strictObject({ claim: bounded.text(bound(100)) }),
        z.strictObject({ count: z.number() }),
      ]),
    });
    const branch = parseLenient(shapes, { part: { claim: 'c'.repeat(160) } });
    expect(branch.ok && branch.value).toEqual({ part: { claim: 'c'.repeat(160) } });
    expect(branch.overruns).toEqual([
      expect.objectContaining({ path: 'part.claim', actual: 160, handling: 'kept-over-ceiling' }),
    ]);
    // No branch fits even softly: the union is one structural fault, at the union.
    const none = parseLenient(shapes, { part: { other: true } });
    expect(none.ok).toBe(false);
    expect(none.issues).toEqual([
      expect.objectContaining({ path: 'part', code: 'invalid_union', soft: false }),
    ]);
  });

  it('[QL-58] applies defaults and transforms, then restores the text it kept', () => {
    const withDefault = z.strictObject({
      text: bounded.text(bound(100)),
      tags: z.array(z.string()).default([]),
    });
    const parsed = parseLenient(withDefault, { text: 't'.repeat(200) });
    expect(parsed.ok && parsed.value).toEqual({ text: 't'.repeat(200), tags: [] });
  });

  it('[QL-58] is idempotent on a valid value, and reports nothing on one within every target', () => {
    const parsed = parseLenient(schema, valid);
    expect(parsed).toEqual({ ok: true, value: valid, overruns: [], repairs: [], issues: [] });
    const again = parseLenient(schema, parsed.value);
    expect(again).toEqual(parsed);
  });

  it('[QL-58] words a fault the one way every reader uses, from a strict parse too', () => {
    const lens = z.strictObject({
      findings: z.array(z.strictObject({ rationale: bounded.text(bound(900)) })),
    });
    const { bounds } = modelSchema(lens);
    const result = lens.safeParse(
      { findings: [{ rationale: 'a' }, { rationale: 'b' }, { rationale: 'r'.repeat(1015) }] },
      { reportInput: true },
    );
    expect(result.success).toBe(true);
    const over = lens.safeParse(
      { findings: [{ rationale: 'a' }, { rationale: 'b' }, { rationale: 'r'.repeat(1200) }] },
      { reportInput: true },
    );
    expect(over.success).toBe(false);
    if (over.success) return;
    const [issue] = schemaIssuesOf(over.error.issues, bounds);
    expect(issue).toEqual({
      code: 'too_big',
      path: 'findings[2].rationale',
      at: ['findings', 2, 'rationale'],
      message: 'Too big: expected string to have <=1125 characters',
      maximum: 1125,
      target: 900,
      actual: 1200,
      kind: 'text',
      soft: true,
    });
    expect(describeIssue({ ...issue, soft: false })).toBe(
      'findings[2].rationale: 1,200 characters; 900 asked, 1,125 accepted',
    );
  });

  it('[QL-58] words an overrun as the size fault it is, and says when work was lost: a cut where the text now ends, a trim how many items went', () => {
    const claim = z.strictObject({
      claims: bounded.list(bound(6, 'list'), bounded.text(CLAIM)),
    });
    const parsed = parseLenient(claim, {
      claims: [
        'c'.repeat(340),
        prose(700),
        prose(1200),
        ...Array.from({ length: 7 }, () => 'held'),
      ],
    });
    if (!parsed.ok) throw new Error('only sizes are at fault');
    expect(
      parsed.overruns.map((overrun) => [overrun.handling, describeOverrun(overrun)]).sort(),
    ).toEqual([
      ['accepted', `claims[0]: 340 characters; 300 asked, 375 accepted ${SOFT_ISSUE_NOTE}`],
      [
        'cut',
        'claims[2]: 1,200 characters; 300 asked, 375 accepted — cut at a word boundary, marked […]',
      ],
      [
        'kept-over-ceiling',
        `claims[1]: 700 characters; 300 asked, 375 accepted ${SOFT_ISSUE_NOTE}`,
      ],
      ['trimmed', 'claims: 10 items; 6 asked, 8 accepted — 2 items dropped'],
    ]);
    // A field kept whole is the issue a strict reader of the same text would have been told about.
    for (const overrun of parsed.overruns) {
      const issue = overrunIssue(overrun);
      expect(issue).toMatchObject({ code: 'too_big', soft: true, kind: overrun.kind });
      const lost = overrun.handling === 'cut' || overrun.handling === 'trimmed';
      expect(describeOverrun(overrun) === describeIssue(issue)).toBe(!lost);
    }

    const one = parseLenient(claim, { claims: Array.from({ length: 9 }, () => 'held') });
    expect(one.ok && one.overruns.map(describeOverrun)).toEqual([
      'claims: 9 items; 6 asked, 8 accepted — 1 item dropped',
    ]);
  });
});

describe('what the contract leaves optional', () => {
  const schema = z.strictObject({
    name: z.string(),
    notes: z.string().optional(),
    tags: z.array(z.strictObject({ label: z.string(), weight: z.number().optional() })).optional(),
    mood: z.string().nullable().optional(),
  });

  it('[QL-62] is shown to the model as required and nullable — a key that takes null already is shown as it is', () => {
    const { json } = modelSchema(schema);
    expect(json['required']).toEqual(['name', 'notes', 'tags', 'mood']);
    const properties = json['properties'] as Record<string, Record<string, unknown>>;
    expect(properties['notes']).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(properties['mood']).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    const [tags] = properties['tags']['anyOf'] as Record<string, unknown>[];
    expect((tags['items'] as Record<string, unknown>)['required']).toEqual(['label', 'weight']);
  });

  it('[QL-62] reads a null written there as absent and records each; a null at a key that takes null stays; one at a required key refuses', () => {
    const parsed = parseLenient(schema, {
      name: 'n',
      notes: null,
      tags: [
        { label: 'a', weight: null },
        { label: 'b', weight: 2 },
      ],
      mood: null,
    });
    expect(parsed.ok && parsed.value).toEqual({
      name: 'n',
      tags: [{ label: 'a' }, { label: 'b', weight: 2 }],
      mood: null,
    });
    expect(parsed.repairs).toEqual([
      { path: 'notes', at: ['notes'], action: 'dropped-null', detail: 'notes' },
      {
        path: 'tags[0].weight',
        at: ['tags', 0, 'weight'],
        action: 'dropped-null',
        detail: 'weight',
      },
    ]);

    const refused = parseLenient(schema, { name: null, notes: 'kept' });
    expect(refused.ok).toBe(false);
    expect(refused.issues.map((issue) => [issue.path, issue.code, issue.soft])).toEqual([
      ['name', 'invalid_type', false],
    ]);
  });

  it('[QL-62] reads a union branch by branch, so a plan whose actions leave a key optional reads null there as absent', () => {
    const plan = z.strictObject({
      actions: z.array(
        z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('click'), serves: z.array(z.string()).optional() }),
          z.strictObject({ kind: z.literal('done') }),
        ]),
      ),
    });
    const parsed = parseLenient(plan, {
      actions: [
        { kind: 'click', serves: null },
        { kind: 'click', serves: ['c1'] },
        { kind: 'done' },
      ],
    });
    expect(parsed.ok && parsed.value).toEqual({
      actions: [{ kind: 'click' }, { kind: 'click', serves: ['c1'] }, { kind: 'done' }],
    });
    expect(parsed.repairs.map((repair) => repair.path)).toEqual(['actions[0].serves']);
  });
});
