import { describe, expect, it } from 'vitest';

import { STANDARD } from '../../core/controllers';
import { confirmed, decision as _decision, ledger, tinyPolicy } from '../../core/testing';
import { REVISE_ONLY } from './controller';

const policy = tinyPolicy();

describe('the canvas controller', () => {
  it('[QL-21] decides like the standard controller wherever that would not restart', () => {
    const clean = ledger({
      criteria: [
        {
          criterionId: 'c1',
          kind: 'must',
          result: 'pass',
          hits: 1,
          confidence: 'high',
          locationRefs: [],
        },
      ],
    });
    expect(REVISE_ONLY.decide(clean, policy).finalDecision).toBe(
      STANDARD.decide(clean, policy).finalDecision,
    );
    expect(REVISE_ONLY.summary.steps.map((step) => step.factor)).toEqual(
      STANDARD.summary.steps.map((step) => step.factor),
    );
  });

  it('[QL-21] never answers retry: a blocker that wants a fresh attempt, a validator block and a score under the floor all revise', () => {
    const blocker = ledger({
      criteria: [
        {
          criterionId: 'c1',
          kind: 'must',
          result: 'fail',
          hits: 1,
          confidence: 'high',
          locationRefs: [],
        },
      ],
      findings: [
        confirmed({ key: 'gap|text', severity: 'critical', fixability: 'requires_retry' }),
      ],
    });
    expect(STANDARD.decide(blocker, policy).finalDecision).toBe('retry');
    const decided = REVISE_ONLY.decide(blocker, policy);
    expect(decided.finalDecision).toBe('revise');
    expect(decided.reason).toContain('never restarted');

    const blocked = ledger({
      validation: [
        {
          validatorId: 'references',
          gate: 'block',
          problems: [{ severity: 'critical', locationRefs: [], message: 'x' }],
        },
      ],
    });
    expect(STANDARD.decide(blocked, policy).finalDecision).toBe('retry');
    expect(REVISE_ONLY.decide(blocked, policy).finalDecision).toBe('revise');

    const floor = ledger({
      criteria: [
        {
          criterionId: 'c1',
          kind: 'must',
          result: 'fail',
          hits: 1,
          confidence: 'high',
          locationRefs: [],
        },
      ],
      findings: [
        confirmed({ key: 'gap|text', severity: 'high', fixability: 'requires_retry' }),
        confirmed({
          key: 'gap|part.1',
          severity: 'high',
          fixability: 'requires_retry',
          locationRefs: ['part.1'],
        }),
      ],
    });
    expect(STANDARD.decide(floor, policy).finalDecision).toBe('retry');
    expect(REVISE_ONLY.decide(floor, policy).finalDecision).toBe('revise');
  });
});
