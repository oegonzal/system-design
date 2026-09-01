import { describe, expect, it } from 'vitest';

import { EVAL_DIMENSIONS } from './evaluations';
import { QUALITY_AREAS, UNMODELLED_QUALITY_AREAS } from './quality-areas';

describe('quality areas', () => {
  it('accounts for every dimension the rubric grades', () => {
    const assessed = QUALITY_AREAS.map((area) => area.assessedBy).filter(
      (dimension) => dimension !== null,
    );
    expect([...assessed].sort()).toEqual([...EVAL_DIMENSIONS].sort());
  });

  /**
   * The point of the list is the second half. If nothing is unmodelled, the
   * rubric is claiming to see everything — which is the overclaim this exists
   * to prevent.
   */
  it('names areas it does not model at all', () => {
    expect(UNMODELLED_QUALITY_AREAS.length).toBeGreaterThan(3);
    expect(UNMODELLED_QUALITY_AREAS.map((area) => area.id)).toContain('cost');
    expect(UNMODELLED_QUALITY_AREAS.map((area) => area.id)).toContain('rollout');
  });

  it('says what a reviewer would ask, for every area', () => {
    for (const area of QUALITY_AREAS) {
      expect(area.note.length, `${area.id} needs a note`).toBeGreaterThan(30);
      expect(area.label.length).toBeGreaterThan(2);
    }
  });

  it('has no duplicate ids', () => {
    const ids = QUALITY_AREAS.map((area) => area.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
