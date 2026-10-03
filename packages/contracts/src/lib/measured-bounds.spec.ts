import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bound, bounded, exact } from './bounds';
import { boundsAgainstMeasured, type MeasuredField } from './measured-bounds';

const schema = z.strictObject({
  claim: bounded.text(bound(300)),
  tags: bounded.list(bound(6, 'list'), bounded.text(bound(40))),
  findings: bounded.list(exact(10), z.string()),
  id: bounded.id(64),
});

const field = (max: number, p99 = max): MeasuredField => ({ n: 120, max, p99, overTarget: 0 });

/** Every bound of `schema` measured comfortably inside it. */
const within = (): Record<string, MeasuredField> => ({
  claim: field(358, 290),
  tags: field(7, 6),
  'tags[]': field(38),
  id: field(19),
});

describe('boundsAgainstMeasured', () => {
  it('[QL-49] passes a schema whose targets sit at or above the 99th percentile written and whose ceilings sit above the longest', () => {
    // A claim measured at 358 against a target of 300 — the 2026-10-02
    // overrun — is within the ceiling (375): a target the 99th percentile
    // clears is what was asked for, and the longest is accepted.
    expect(boundsAgainstMeasured(schema, within())).toEqual([]);
  });

  it('[QL-49] fails a target under the 99th percentile written, and a ceiling at or under the longest', () => {
    const fields = { ...within(), claim: field(375, 301), 'tags[]': field(80, 30) };
    expect(boundsAgainstMeasured(schema, fields)).toEqual([
      'claim: target 300 < measured p99 301',
      'claim: ceiling 375 ≤ measured max 375',
      'tags[]: ceiling 80 ≤ measured max 80',
    ]);
    // An id is exact, target and ceiling one number: one written at its max leaves no room.
    expect(boundsAgainstMeasured(schema, { ...within(), id: field(64) })).toEqual([
      'id: ceiling 64 ≤ measured max 64',
    ]);
  });

  it('[QL-49] fails a measured path no schema declares any more, and a declared one nothing measured', () => {
    const { claim: _claim, ...rest } = within();
    expect(boundsAgainstMeasured(schema, { ...rest, 'claims[]': field(10) })).toEqual([
      'claims[]: measured, but no schema declares a bound there',
      'claim: declared, never measured',
    ]);
  });

  it('[QL-49] never holds an exact list, which its caller slices to, and holds an exempt bound to nothing, with its reason', () => {
    // A lens's findings ran to twelve against a cap of ten: the engine kept ten.
    const fields = { ...within(), findings: field(12) };
    expect(boundsAgainstMeasured(schema, fields)).toEqual([]);
    const { tags: _tags, ...rest } = fields;
    expect(boundsAgainstMeasured(schema, { ...rest, tags: field(10) })).toEqual([
      'tags: target 6 < measured p99 10',
      'tags: ceiling 8 ≤ measured max 10',
    ]);
    expect(
      boundsAgainstMeasured(
        schema,
        { ...rest, tags: field(10) },
        {
          exempt: { tags: 'a policy sizes it' },
        },
      ),
    ).toEqual([]);
    const { id: _id, ...noId } = within();
    expect(
      boundsAgainstMeasured(schema, noId, { exempt: { id: 'nothing wrote one yet' } }),
    ).toEqual([]);
  });

  it('[QL-49] reads a raw max as a bound with no tolerance, and refuses a path two schemas measured together both declare', () => {
    const raw = z.strictObject({ summary: z.string().max(100), rows: z.array(z.string()).max(4) });
    // A raw list max asks for exactly what it accepts: a cap, never held.
    expect(boundsAgainstMeasured(raw, { summary: field(99), rows: field(9) })).toEqual([]);
    expect(boundsAgainstMeasured(raw, { summary: field(100), rows: field(2) })).toEqual([
      'summary: ceiling 100 ≤ measured max 100',
    ]);
    const other = z.strictObject({ claim: bounded.text(bound(500)) });
    expect(boundsAgainstMeasured([schema, other], within())).toEqual([
      'claim: declared by two schemas',
    ]);
  });
});
