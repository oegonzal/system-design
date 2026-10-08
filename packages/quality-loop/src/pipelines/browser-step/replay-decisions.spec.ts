import type { EvidenceLedger, QualityControlDecision } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { STANDARD } from '../../core/controllers';
import { BROWSER_STEP } from './definition';
import session from './fixtures/session-2026-10-08.json';

/**
 * The five plans of the recorded session of 2026-10-08 (dump
 * 00-33-32-229-a4a941, steps 3, 6, 22, 27, 30) that one sample of one critic
 * vetoed by itself: each finding of a gating type that cited no criterion,
 * each the only blocker of its plan. Their ledgers are replayed through the
 * controller as it is now, so the policy's meaning of `cited` shows its
 * effect on a real session as a diff rather than an argument.
 */
interface RecordedDecision {
  step: number;
  recorded: {
    runId: string;
    finalDecision: string;
    overall: number;
    policyAllowed: boolean;
    blockingFindings: string[];
  };
  ledger: EvidenceLedger;
}

const steps = session as unknown as RecordedDecision[];

const replay = (
  step: number,
): { recorded: RecordedDecision['recorded']; now: QualityControlDecision } => {
  const found = steps.find((candidate) => candidate.step === step);
  if (found === undefined) throw new Error(`no recorded step ${step}`);
  return { recorded: found.recorded, now: STANDARD.decide(found.ledger, BROWSER_STEP.policy) };
};

describe('the recorded session of 2026-10-08, replayed through the controller', () => {
  it('[QL-5] every plan one uncited finding vetoed alone now passes the policy gate, with the finding still priced', () => {
    for (const step of [3, 6, 22, 27, 30]) {
      const { recorded, now } = replay(step);
      // As recorded: the gate closed on a finding that cited nothing.
      expect(recorded.policyAllowed).toBe(false);
      expect(recorded.blockingFindings.length).toBeGreaterThan(0);
      // Now: priced, never a veto — the score is what it was, the gate is open.
      expect([step, now.gates.policyAllowed]).toEqual([step, true]);
      expect([step, now.blocking.findings]).toEqual([step, []]);
      expect([step, now.scores.overall]).toEqual([step, recorded.overall]);
    }
  });

  it('[QL-5] the decision then rests on the score the policy declares: three plans over the bar are accepted, two under it are not', () => {
    expect([6, 22, 30].map((step) => [step, replay(step).now.finalDecision])).toEqual([
      [6, 'accept'],
      [22, 'accept'],
      [30, 'accept'],
    ]);
    // Step 22 would have closed its unit `already-done` and ended the session
    // `mission-complete` on the evaluator's word alone: the cost of the veto
    // going, pinned here, and answered where the mission ties a stop to words
    // the page must show.
    for (const step of [3, 27]) {
      expect([step, replay(step).now.finalDecision]).not.toEqual([step, 'accept']);
    }
  });
});
