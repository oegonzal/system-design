import { PRACTICE_FORMATS, type SuccessCriterion } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { deepDiveTargets } from './deep-dive-targets';

const criterion = (id: string, kind: string): SuccessCriterion => ({
  id,
  kind,
  statement: `${id} holds`,
});

const rubric = [
  criterion('c1', 'functional'),
  criterion('c2', 'non_functional'),
  criterion('c3', 'scale'),
  criterion('c4', 'tradeoff'),
  criterion('c5', 'functional'),
  criterion('c6', 'boundary'),
];

describe('deepDiveTargets', () => {
  it('[DEL-9] unbound criteria first, each group by the format’s emphasis then rubric order, as many as the format probes', () => {
    const ids = (bound: string[]) =>
      deepDiveTargets(rubric, bound, PRACTICE_FORMATS.interview).map((target) => target.id);
    // interview emphasis: functional, tradeoff, boundary, non_functional; probes 3.
    expect(ids([])).toEqual(['c1', 'c5', 'c4']);
    expect(ids(['c1', 'c5'])).toEqual(['c4', 'c6', 'c2']);
    // With more bound than the probes leave room for, the bound follow the unbound in the same order.
    expect(ids(['c1', 'c4', 'c5', 'c6', 'c2'])).toEqual(['c3', 'c1', 'c5']);
    expect(deepDiveTargets(rubric, ['c1'], PRACTICE_FORMATS.system)).toEqual([]);
  });

  it('[DEL-9] is deterministic: the same design draws the same questions', () => {
    const once = deepDiveTargets(rubric, ['c2'], PRACTICE_FORMATS.interview);
    expect(deepDiveTargets(rubric, ['c2'], PRACTICE_FORMATS.interview)).toEqual(once);
  });
});
