import { describe, expect, it } from 'vitest';

import { confirmed, evidence, ledger, tinyPolicy } from '../testing';
import { dimensionFloor } from './dimension-floor';
import { DIMENSION_FLOOR, STANDARD } from './index';

describe('dimensionFloor', () => {
  it('[QL-8] keeps an artifact in the loop when a dimension is at a failing grade although the overall accepts', () => {
    // substance 100 × 0.9 + form 0 × 0.1 = 90: the standard order accepts it.
    const input = ledger({
      criteria: [evidence({}), evidence({ criterionId: 'c2', kind: 'nice', result: 'fail' })],
    });
    const policy = { ...tinyPolicy(), dimensionWeights: { substance: 0.9, form: 0.1 } };
    const standard = STANDARD.decide(input, policy);
    expect(standard.finalDecision).toBe('accept');

    const floored = DIMENSION_FLOOR.decide(input, policy);
    expect(floored.scores).toEqual(standard.scores);
    expect(floored.finalDecision).toBe('revise');
    expect(floored.reason).toBe('below the floor 50: form 0; 1 remediation(s) to apply');
    expect(floored.trace.steps.map((step) => `${step.factor}:${step.outcome}`)).toEqual([
      'scores:computed',
      'artifact:passed',
      'validators:passed',
      'evidence:passed',
      'policy-allowed:passed',
      'dimension-floor:decided',
      'accept-threshold:skipped',
      'reject-floor:skipped',
      'route:skipped',
    ]);
    expect(DIMENSION_FLOOR.summary.steps[4]).toEqual({
      factor: 'dimension-floor',
      params: { floor: 50 },
    });

    // At the floor is not below it.
    const atFloor = ledger({
      criteria: [evidence({}), evidence({ criterionId: 'c2', kind: 'nice', result: 'partial' })],
    });
    expect(DIMENSION_FLOOR.decide(atFloor, tinyPolicy()).finalDecision).toBe('accept');
  });

  it('[QL-8] judges only assessed dimensions, and routes like the standard route when nothing can be acted on', () => {
    const unassessed = ledger({ criteria: [evidence({})] });
    expect(DIMENSION_FLOOR.decide(unassessed, tinyPolicy()).finalDecision).toBe('accept');

    // form: 100 − 40 − 25 × 0.7 = 42.5 from two findings nobody can fix locally;
    // weighted 0.9 / 0.1 the overall is 94.3, which the standard order accepts.
    const stuck = ledger({
      criteria: [evidence({})],
      findings: [
        confirmed({
          type: 'wrong',
          key: 'wrong|a',
          severity: 'critical',
          fixability: 'requires_user',
        }),
        confirmed({ type: 'wrong', key: 'wrong|b', severity: 'high', fixability: 'unfixable' }),
      ],
    });
    const policy = {
      ...tinyPolicy(),
      dimensionWeights: { substance: 0.9, form: 0.1 },
      blockingSeverities: [] as never[],
    };
    expect(STANDARD.decide(stuck, policy).finalDecision).toBe('accept');
    const floored = DIMENSION_FLOOR.decide(stuck, policy);
    expect(floored.finalDecision).toBe('escalate');
    expect(floored.reason).toBe(
      'below the floor 50: form 42.5; below the accept threshold with nothing the producer can act on',
    );
  });

  it('[QL-1] refuses a floor outside [0, 100] where it is declared', () => {
    expect(() => dimensionFloor(101)).toThrow(/outside \[0, 100\]/);
    expect(() => dimensionFloor(-1)).toThrow(/outside \[0, 100\]/);
    expect(() => dimensionFloor(Number.NaN)).toThrow(/outside \[0, 100\]/);
    expect(dimensionFloor(0).params).toEqual({ floor: 0 });
  });
});
