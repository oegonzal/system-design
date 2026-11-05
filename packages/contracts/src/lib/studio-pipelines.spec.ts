import { describe, expect, it } from 'vitest';

import { PLATFORM_IDS } from './platforms';
import { CRITERION_STATEMENT_BOUND } from './quality-loop/evidence';
import {
  CANVAS_CRITERION_KIND_LABELS,
  CANVAS_CRITERION_KINDS,
  CANVAS_MAX_CRITERIA,
  CANVAS_STANDING_CRITERIA,
  canvasCriterionKindLabel,
  PLATFORM_STANDING_CRITERIA,
  standingCriteriaFor,
  withStandingCriteria,
} from './studio-pipelines';

describe('canvas criterion kind labels', () => {
  it('[UX-14] names every declared kind for a reader, and nothing for a kind the pipeline does not declare', () => {
    expect(Object.keys(CANVAS_CRITERION_KIND_LABELS)).toEqual([...CANVAS_CRITERION_KINDS]);
    expect(canvasCriterionKindLabel('non_functional')).toBe('Non-functional');
    expect(canvasCriterionKindLabel('domain_model')).toBe('Domain model');
    expect(canvasCriterionKindLabel('tradeoff')).toBe('Trade-off');
    expect(canvasCriterionKindLabel('constraint')).toBe('Constraint');
    expect(canvasCriterionKindLabel('communication')).toBe('Communication');
    // An open vocabulary: another pipeline's kind falls back to the reader's own rendering.
    expect(canvasCriterionKindLabel('fidelity')).toBeNull();
    expect(canvasCriterionKindLabel('toString')).toBeNull();
  });
});

describe('the standing criteria', () => {
  const own = [
    { kind: 'functional', statement: 'List orders.' },
    { kind: 'scale', statement: '150 requests per second at peak.' },
  ];

  it('[EVAL-4] [EVAL-6] are three trade-off rows then two communication rows, of declared kind and within the statement bound, closing every rubric after the prompt’s own rows', () => {
    for (const criterion of [...CANVAS_STANDING_CRITERIA, ...PLATFORM_STANDING_CRITERIA]) {
      expect(CANVAS_CRITERION_KINDS).toContain(criterion.kind);
      expect(criterion.statement.length).toBeLessThanOrEqual(CRITERION_STATEMENT_BOUND.target);
    }
    expect(CANVAS_STANDING_CRITERIA.map((c) => c.kind)).toEqual([
      'tradeoff',
      'tradeoff',
      'tradeoff',
      'communication',
      'communication',
    ]);
    expect(withStandingCriteria(own, null).map((c) => `${c.id}:${c.kind}`)).toEqual([
      'c1:functional',
      'c2:scale',
      'c3:tradeoff',
      'c4:tradeoff',
      'c5:tradeoff',
      'c6:communication',
      'c7:communication',
    ]);
  });

  it('[EVAL-6] [GEN-7] add the platform constraint last, and only for a prompt that declares a platform', () => {
    expect(PLATFORM_STANDING_CRITERIA.map((c) => c.kind)).toEqual(['constraint']);
    expect(standingCriteriaFor(null)).toEqual(CANVAS_STANDING_CRITERIA);
    const [platform] = PLATFORM_IDS;
    expect(standingCriteriaFor(platform)).toEqual([
      ...CANVAS_STANDING_CRITERIA,
      ...PLATFORM_STANDING_CRITERIA,
    ]);
    const rubric = withStandingCriteria(own, platform);
    expect(rubric.map((c) => `${c.id}:${c.kind}`)).toEqual([
      'c1:functional',
      'c2:scale',
      'c3:tradeoff',
      'c4:tradeoff',
      'c5:tradeoff',
      'c6:communication',
      'c7:communication',
      'c8:constraint',
    ]);
    expect(rubric[7].statement).toBe(PLATFORM_STANDING_CRITERIA[0].statement);
  });

  it('[EVAL-4] never pass the pipeline’s cap: a prompt whose rows would crowd them out keeps its first rows, with or without a platform', () => {
    const crowded = Array.from({ length: CANVAS_MAX_CRITERIA + 3 }, (_, index) => ({
      kind: 'functional',
      statement: `Requirement ${index + 1}.`,
    }));
    for (const platform of [null, ...PLATFORM_IDS]) {
      const standing = standingCriteriaFor(platform);
      const rubric = withStandingCriteria(crowded, platform);
      expect(rubric).toHaveLength(CANVAS_MAX_CRITERIA);
      expect(rubric.slice(-standing.length).map((c) => c.kind)).toEqual(
        standing.map((c) => c.kind),
      );
      expect(rubric[0].statement).toBe('Requirement 1.');
      expect(new Set(rubric.map((c) => c.id)).size).toBe(CANVAS_MAX_CRITERIA);
    }
  });
});
