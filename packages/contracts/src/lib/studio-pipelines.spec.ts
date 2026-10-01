import { describe, expect, it } from 'vitest';

import {
  CANVAS_CRITERION_KIND_LABELS,
  CANVAS_CRITERION_KINDS,
  canvasCriterionKindLabel,
} from './studio-pipelines';

describe('canvas criterion kind labels', () => {
  it('[UX-14] names every declared kind for a reader, and nothing for a kind the pipeline does not declare', () => {
    expect(Object.keys(CANVAS_CRITERION_KIND_LABELS)).toEqual([...CANVAS_CRITERION_KINDS]);
    expect(canvasCriterionKindLabel('non_functional')).toBe('Non-functional');
    expect(canvasCriterionKindLabel('constraint')).toBe('Constraint');
    // An open vocabulary: another pipeline's kind falls back to the reader's own rendering.
    expect(canvasCriterionKindLabel('fidelity')).toBeNull();
    expect(canvasCriterionKindLabel('toString')).toBeNull();
  });
});
