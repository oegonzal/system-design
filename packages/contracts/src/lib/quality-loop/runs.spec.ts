import { describe, expect, it } from 'vitest';

import { gradeStopReason, type QualityRunRequestSummary } from './runs';
import { STOP_REASONS, STOP_REASON_CAUSES } from './vocab';

type Asked = Pick<QualityRunRequestSummary, 'outputProvided' | 'adoptedFrom' | 'maxIterations'>;

/** A grade: one judgement of the artifact handed in. */
const grade: Asked = { outputProvided: true, adoptedFrom: null, maxIterations: 1 };
/** A coach: the same run, given iterations to revise in — from a draft, or from an adopted grade. */
const coach: Asked = { outputProvided: true, adoptedFrom: null, maxIterations: 3 };
const adopting: Asked = {
  outputProvided: false,
  adoptedFrom: { runId: 'run-1', iteration: 1 },
  maxIterations: 3,
};

describe('gradeStopReason', () => {
  // A plain grade showed "Max iterations" beside its decision, which reads as
  // a limit the author hit; it is only how one judgement ends.
  it('[DEL-4] a run asked to judge once has no stop worth telling: it always ends on its budget of one', () => {
    for (const reason of STOP_REASONS) expect(gradeStopReason(reason, grade)).toBeNull();
    // An adopted grade with no iteration to revise in is a judgement too.
    expect(gradeStopReason('max-iterations', { ...adopting, maxIterations: 1 })).toBeNull();
  });

  it('[DEL-4] a run that could revise tells the stops its budget caused, and leaves a decision’s to the decision', () => {
    for (const asked of [coach, adopting]) {
      expect(STOP_REASONS.map((reason) => gradeStopReason(reason, asked))).toEqual([
        null,
        null,
        null,
        'plateau',
        'max-iterations',
      ]);
    }
    expect(gradeStopReason(null, coach)).toBeNull();
  });

  it('classifies every stop reason by what caused it', () => {
    expect(Object.keys(STOP_REASON_CAUSES)).toEqual([...STOP_REASONS]);
  });
});
