import { describe, expect, it } from 'vitest';

import { makeEscalatedRun, makePipeline, makeRun } from '../../../testing/fixtures';
import { dimensionRows, gateRows, policyNumbers, validatorRows } from './policy-view';

const traceOf = (run = makeRun()) => {
  const trace = run.trace;
  if (trace === null) throw new Error('fixture has no trace');
  return trace.iterations[0].decision.trace;
};

describe('the declared policy beside what it did', () => {
  it('[QLU-10] puts every declared gate on one row with what the trace says it did', () => {
    const rows = gateRows(makePipeline().controller, traceOf());
    // The engine records `scores` before any gate is consulted, and no
    // controller declares it — so it is shown in the trace's own position and
    // labelled as the engine's.
    expect(rows[0]).toMatchObject({ factor: 'scores', order: 1, undeclared: true, params: null });
    expect(rows.map((row) => row.factor)).toEqual([
      'scores',
      'artifact',
      'validators',
      'evidence',
      'policy-allowed',
      'accept-threshold',
      'reject-floor',
      'route',
    ]);
    expect(rows.find((row) => row.factor === 'route')).toMatchObject({
      outcome: 'decided',
      detail: 'revise: 2 remediations',
      unreached: false,
    });
    expect(rows.every((row) => row.undeclared || row.params !== null)).toBe(true);
  });

  it('[QLU-10] a gate the iteration never reached says so rather than reading as passed', () => {
    const controller = {
      id: 'standard',
      steps: [...makePipeline().controller.steps, { factor: 'second-opinion', params: { at: 3 } }],
    };
    const rows = gateRows(controller, traceOf());
    const extra = rows.find((row) => row.factor === 'second-opinion');
    expect(extra).toMatchObject({ unreached: true, order: null, outcome: null, params: { at: 3 } });
  });

  it('[QLU-10] shows each penalty from its list price through decay to what it subtracted', () => {
    const rows = dimensionRows(makePipeline().policy, traceOf());
    const soundness = rows.find((row) => row.dimension === 'soundness');
    expect(soundness).toMatchObject({
      declaredWeight: 0.4,
      weight: 0.4,
      base: 100,
      penaltyTotal: 12,
      score: 88,
      maxPerDimension: 60,
    });
    expect(soundness?.penalties[0]).toMatchObject({
      key: 'unsupported_claim|summary',
      position: 0,
      listPoints: 12,
      decayed: 12,
      points: 12,
      // The multiplier this position carried, which the trace does not state.
      decay: 1,
      clamped: false,
    });
    expect(soundness?.penalisedBy).toEqual(['unsupported_claim']);
  });

  it('[QLU-10] a score the floor produced is not printed as a subtraction', () => {
    // The engine clamps `base - penaltyTotal` to the score range, so once the
    // penalties exceed the base the subtraction and the score genuinely differ —
    // and writing them as an equation states something false.
    const trace = traceOf();
    const floored = dimensionRows(makePipeline().policy, {
      ...trace,
      dimensions: trace.dimensions.map((dimension) =>
        dimension.dimension === 'soundness'
          ? { ...dimension, base: 100, penaltyTotal: 140, score: 0 }
          : dimension,
      ),
    });
    expect(floored.find((row) => row.dimension === 'soundness')?.floored).toBe(true);
    // An ordinary dimension is not flagged, so the equation still reads as one.
    expect(floored.find((row) => row.dimension === 'completeness')?.floored).toBe(false);
    expect(dimensionRows(makePipeline().policy, traceOf()).every((row) => !row.floored)).toBe(true);
  });

  it('[QLU-10] names a dimension no criterion kind can earn credit in', () => {
    // Such a dimension starts at 100 and only ever falls: it carries weight
    // without carrying information, which the engine's own rules forbid.
    const pipeline = makePipeline();
    const rows = dimensionRows(
      {
        ...pipeline.policy,
        dimensionWeights: { ...pipeline.policy.dimensionWeights, compliance: 0.1 },
      },
      traceOf(),
    );
    expect(rows.map((row) => [row.dimension, row.earnable])).toEqual([
      ['completeness', true],
      ['soundness', false],
      ['compliance', false],
    ]);
  });

  it('[QLU-10] a dimension the iteration never assessed keeps its declared weight and no score', () => {
    const rows = dimensionRows(makePipeline().policy, traceOf(makeEscalatedRun()));
    expect(rows.map((row) => [row.dimension, row.declaredWeight, row.weight, row.score])).toEqual([
      ['completeness', 0.6, null, null],
      ['soundness', 0.4, null, null],
    ]);
  });

  it('[QLU-10] the validator the engine injects is labelled, not treated as a surprise', () => {
    const reports = [
      { validatorId: 'schema', gate: 'block' as const, problems: [] },
      { validatorId: 'references', gate: 'block' as const, problems: [] },
    ];
    const rows = validatorRows(
      makePipeline({ validators: [{ id: 'references', gate: 'block' }] }),
      reports,
    );
    expect(rows.map((row) => [row.validatorId, row.injected, row.unreported])).toEqual([
      ['schema', true, false],
      ['references', false, false],
    ]);
    // Declared but never reported is its own state.
    expect(
      validatorRows(makePipeline({ validators: [{ id: 'nothing', gate: 'warn' }] }), []),
    ).toEqual([
      { validatorId: 'nothing', gate: 'warn', problems: [], injected: false, unreported: true },
    ]);
  });

  it('[QLU-10] flattens the policy’s numbers, and answers null for every one of them with no registry', () => {
    expect(policyNumbers(makePipeline().policy)).toMatchObject({
      acceptAt: 80,
      rejectBelow: 35,
      minHits: 1,
      minAssessedShare: 0.75,
      decay: 0.7,
      maxPerDimension: 60,
      blockingSeverities: ['critical'],
      maxIterations: 3,
      plateauAfter: 2,
      concurrency: 2,
      version: '1',
    });
    const none = policyNumbers(null);
    expect(none.acceptAt).toBeNull();
    expect(none.blockingSeverities).toEqual([]);
    expect(gateRows(null, null)).toEqual([]);
    expect(dimensionRows(null, null)).toEqual([]);
  });
});
