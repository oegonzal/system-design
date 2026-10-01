import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { criteriaSchema, evaluationSchema, findingsSchema } from './schemas';
import { boundsBelowMeasured, finding, result } from '../testing';

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
      criteriaSchema(['must'], 3).safeParse({ criteria: [{ kind: 'nice', statement: 'x' }] })
        .success,
    ).toBe(false);
  });

  it('[QL-4] a lens rationale bound sits above the longest any lens has measurably written', () => {
    // Across every pipeline's recorded runs (static/runs, to 2026-10-01): a
    // critic's longest rationale ran 695 characters, an evaluator's 619. A
    // rationale past its bound is a miss that loses the whole sample.
    expect(
      boundsBelowMeasured(findingsSchema(['gap'], ['c1'], ['text'], 4), {
        'findings[].rationale': 695,
      }),
    ).toEqual([]);
    expect(
      boundsBelowMeasured(evaluationSchema(['c1'], ['text'], 1), { 'results[].rationale': 619 }),
    ).toEqual([]);
  });

  it('[QL-2] a derived statement bound sits above the longest any deriver has measurably written', () => {
    // Across every pipeline's recorded derive-criteria answers (static/runs,
    // to 2026-10-01) the longest statement ran 323 characters, a
    // system-design one. A statement past its bound fails the derivation
    // whole — never cut to fit — so the bound must not be one a model meets.
    expect(
      boundsBelowMeasured(criteriaSchema(['must'], 3), { 'criteria[].statement': 323 }),
    ).toEqual([]);
  });

  it('[QL-6] no schema a model answers contains a number', () => {
    const schemas = [
      criteriaSchema(['must'], 3),
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
