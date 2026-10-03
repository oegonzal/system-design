import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bound, boundsAgainstMeasured, modelSchema } from '@sysdesign/contracts';

import measured from './measured.json';
import { criteriaSchema, evaluationSchema, findingsSchema } from './schemas';
import { finding, result } from '../testing';

const walk = (node: unknown, visit: (value: Record<string, unknown>) => void): void => {
  if (Array.isArray(node)) return node.forEach((item) => walk(item, visit));
  if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((value) => walk(value, visit));
  }
};

describe('per-request schemas', () => {
  it('[QL-4] locks a finding to the listed locations and criteria', () => {
    const schema = findingsSchema(['gap', 'wrong'], ['c1'], ['text', 'part.1'], 4);
    expect(
      schema.safeParse({ findings: [finding({ locationRefs: ['part.1'], criterionIds: ['c1'] })] })
        .success,
    ).toBe(true);
    expect(schema.safeParse({ findings: [finding({ locationRefs: ['nowhere'] })] }).success).toBe(
      false,
    );
    expect(schema.safeParse({ findings: [finding({ criterionIds: ['c9'] })] }).success).toBe(false);
    expect(schema.safeParse({ findings: [finding({ type: 'style' })] }).success).toBe(false);
  });

  it('[QL-4] degrades to an empty list rather than inventing an enum when nothing exists', () => {
    const schema = findingsSchema(['gap'], [], [], 4);
    expect(
      schema.safeParse({ findings: [finding({ locationRefs: [], criterionIds: [] })] }).success,
    ).toBe(true);
    expect(schema.safeParse({ findings: [finding({ locationRefs: ['text'] })] }).success).toBe(
      false,
    );
  });

  it('[QL-4] an evaluator may only judge the criteria it was handed', () => {
    const schema = evaluationSchema(['c1'], ['text'], 1);
    expect(schema.safeParse({ results: [result()], advisoryVerdict: null }).success).toBe(true);
    expect(
      schema.safeParse({ results: [result({ criterionId: 'c2' })], advisoryVerdict: 'accept' })
        .success,
    ).toBe(false);
    expect(
      criteriaSchema(['must'], 3, bound(400)).safeParse({
        criteria: [{ kind: 'nice', statement: 'x' }],
      }).success,
    ).toBe(false);
  });

  it('[QL-4] [QL-49] every bound a lens is shown sits above what any lens has measurably written', () => {
    // `measured.json` beside this file: what every critic and evaluator of
    // every pipeline wrote, refreshed by `pnpm measure:bounds`. How many
    // findings or results a lens returns is its own declared `maxItems`,
    // which the engine slices to — an exact list no measurement holds. A
    // deriver's statements are held per pipeline, since the bound is the
    // task's.
    expect(measured.runs).toBeGreaterThan(0);
    expect(
      boundsAgainstMeasured(
        [findingsSchema(['gap'], ['c1'], ['text'], 4), evaluationSchema(['c1'], ['text'], 4)],
        measured.fields,
      ),
    ).toEqual([]);
  });

  it('[QL-2] the statement bound is the task’s: its target shown to the model in the schema and in words, its ceiling accepted', () => {
    const schema = criteriaSchema(['must'], 3, bound(600));
    const long = 'x'.repeat(700);
    expect(schema.safeParse({ criteria: [{ kind: 'must', statement: long }] }).success).toBe(true);
    expect(
      criteriaSchema(['must'], 3, bound(400)).safeParse({
        criteria: [{ kind: 'must', statement: long }],
      }).success,
    ).toBe(false);
    const shown = JSON.stringify(modelSchema(schema).json);
    expect(shown).toContain('within 600 characters');
    expect(shown).toContain('"maxLength":600');
  });

  it('[QL-6] no schema a model answers contains a number', () => {
    const schemas = [
      criteriaSchema(['must'], 3, bound(400)),
      findingsSchema(['gap'], ['c1'], ['text'], 4),
      evaluationSchema(['c1'], ['text'], 1),
      findingsSchema(['gap'], [], [], 4),
    ];
    for (const schema of schemas) {
      const types: string[] = [];
      walk(z.toJSONSchema(schema), (node) => {
        if (typeof node['type'] === 'string') types.push(node['type']);
      });
      expect(types).not.toContain('number');
      expect(types).not.toContain('integer');
    }
  });
});
