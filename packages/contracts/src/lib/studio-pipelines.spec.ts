import { describe, expect, it } from 'vitest';

import { CRITERION_STATEMENT_BOUND } from './quality-loop/evidence';
import {
  CANVAS_CRITERION_KIND_LABELS,
  CANVAS_CRITERION_KINDS,
  CANVAS_MAX_CRITERIA,
  CANVAS_STANDING_CRITERIA,
  canvasCriterionKindLabel,
  withStandingCriteria,
} from './studio-pipelines';

describe('canvas criterion kind labels', () => {
  it('[UX-14] names every declared kind for a reader, and nothing for a kind the pipeline does not declare', () => {
    expect(Object.keys(CANVAS_CRITERION_KIND_LABELS)).toEqual([...CANVAS_CRITERION_KINDS]);
    expect(canvasCriterionKindLabel('non_functional')).toBe('Non-functional');
    expect(canvasCriterionKindLabel('domain_model')).toBe('Domain model');
    expect(canvasCriterionKindLabel('tradeoff')).toBe('Trade-off');
    expect(canvasCriterionKindLabel('constraint')).toBe('Constraint');
    // An open vocabulary: another pipeline's kind falls back to the reader's own rendering.
    expect(canvasCriterionKindLabel('fidelity')).toBeNull();
    expect(canvasCriterionKindLabel('toString')).toBeNull();
  });
});

describe('the standing criteria', () => {
  it('[EVAL-4] are trade-off criteria of declared kind, within the statement bound, that close every rubric after the prompt’s own rows', () => {
    for (const criterion of CANVAS_STANDING_CRITERIA) {
      expect(CANVAS_CRITERION_KINDS).toContain(criterion.kind);
      expect(criterion.kind).toBe('tradeoff');
      expect(criterion.statement.length).toBeLessThanOrEqual(CRITERION_STATEMENT_BOUND.target);
    }
    const own = [
      { kind: 'functional', statement: 'List orders.' },
      { kind: 'scale', statement: '150 requests per second at peak.' },
    ];
    expect(withStandingCriteria(own).map((c) => `${c.id}:${c.kind}`)).toEqual([
      'c1:functional',
      'c2:scale',
      'c3:tradeoff',
      'c4:tradeoff',
      'c5:tradeoff',
    ]);
  });

  it('[EVAL-4] never pass the pipeline’s cap: a prompt whose rows would crowd them out keeps its first rows', () => {
    const crowded = Array.from({ length: CANVAS_MAX_CRITERIA + 3 }, (_, index) => ({
      kind: 'functional',
      statement: `Requirement ${index + 1}.`,
    }));
    const rubric = withStandingCriteria(crowded);
    expect(rubric).toHaveLength(CANVAS_MAX_CRITERIA);
    expect(rubric.slice(-CANVAS_STANDING_CRITERIA.length).map((c) => c.kind)).toEqual(
      CANVAS_STANDING_CRITERIA.map((c) => c.kind),
    );
    expect(rubric[0].statement).toBe('Requirement 1.');
    expect(new Set(rubric.map((c) => c.id)).size).toBe(CANVAS_MAX_CRITERIA);
  });
});
