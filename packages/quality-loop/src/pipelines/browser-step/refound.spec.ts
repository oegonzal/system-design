import {
  composeStepGoal,
  listingObservation,
  stepGoalInput,
  type CriterionEvidence,
  type PageObservation,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { STANDARD } from '../../core/controllers';
import { confirmed, ledger } from '../../core/testing';
import { BROWSER_STEP } from './definition';
import { readIndex } from './input';
import { refoundOnContentlessPage } from './refound';

/** A composed step goal over a page that shows nothing — the initial about:blank. */
const contentlessGoal = (): string => {
  const blank: PageObservation = {
    ...listingObservation(),
    url: 'about:blank',
    title: '',
    elements: [],
    ariaSnapshot: '',
    snapshotRung: 'full',
  };
  return composeStepGoal(stepGoalInput({ observation: blank }));
};

/** A composed step goal over a real results page. */
const contentGoal = (): string =>
  composeStepGoal(stepGoalInput({ observation: listingObservation() }));

const safetyFail: CriterionEvidence = {
  criterionId: 'c12',
  kind: 'safety',
  result: 'fail',
  hits: 1,
  confidence: 'high',
  locationRefs: ['assessment'],
};
const progressFail: CriterionEvidence = {
  criterionId: 'c4',
  kind: 'progress',
  result: 'fail',
  hits: 1,
  confidence: 'high',
  locationRefs: ['assessment'],
};
const missedStop = confirmed({
  key: 'missed_stop|',
  type: 'missed_stop',
  severity: 'critical',
  criterionIds: ['c12'],
  locationRefs: [],
});

const resultOf = (criteria: readonly CriterionEvidence[], id: string): string =>
  criteria.find((evidence) => evidence.criterionId === id)?.result ?? 'absent';

describe('refounding a step on a contentless page', () => {
  it('[QL-36] the two goals differ only in whether the page shows content', () => {
    expect(readIndex(contentlessGoal())?.pageShowsContent).toBe(false);
    expect(readIndex(contentGoal())?.pageShowsContent).toBe(true);
    // The pipeline wires the pass, so the loop applies it.
    expect(BROWSER_STEP.refoundEvidence).toBe(refoundOnContentlessPage);
  });

  it('[QL-36] a failed gating criterion on a page that shows nothing is re-founded not-applicable, and the gate opens', () => {
    const judged = ledger({ criteria: [safetyFail, progressFail], findings: [missedStop] });
    // Before: the hallucinated limit blocks the plan whole.
    expect(STANDARD.decide(judged, BROWSER_STEP.policy).gates.policyAllowed).toBe(false);

    const founded = refoundOnContentlessPage(judged, contentlessGoal(), BROWSER_STEP.policy);
    // The safety stop-criterion is no longer a failure to gate on; progress (which
    // does not gate) is left exactly as the judges settled it.
    expect(resultOf(founded.criteria, 'c12')).toBe('not_applicable');
    expect(resultOf(founded.criteria, 'c4')).toBe('fail');
    // The missed_stop that cited c12 is no longer corroborated, so nothing blocks
    // the navigate that would leave the blank page.
    expect(STANDARD.decide(founded, BROWSER_STEP.policy).gates.policyAllowed).toBe(true);
    // The finding is kept on the record, not hidden.
    expect(founded.findings.map((finding) => finding.key)).toContain('missed_stop|');
  });

  it('[QL-36] a real stop on a page that shows content still gates — the page where the words are is the judges’ to assess', () => {
    const judged = ledger({ criteria: [safetyFail], findings: [missedStop] });
    const founded = refoundOnContentlessPage(judged, contentGoal(), BROWSER_STEP.policy);
    expect(founded).toBe(judged);
    expect(STANDARD.decide(founded, BROWSER_STEP.policy).gates.policyAllowed).toBe(false);
  });
});
