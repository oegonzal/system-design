import {
  composeStepGoal,
  MISSION_FIXTURE,
  routePlan,
  type PageObservation,
  type StepPlan,
  type ValidationReport,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { contractOf, decision, ledger, runDto, traceOf } from '../../core/testing';
import { BROWSER_STEP } from './definition';
import session from './fixtures/session-2026-10-07.json';
import { limitsValidator, referencesValidator } from './validators';

/**
 * The application-form steps of the recorded session of 2026-10-07 (dump
 * 02-40-36-364-9fa502, steps 16–22), each with its observation trimmed to the
 * elements its plan cites, the plan as the producer wrote it, and what the
 * loop decided. Replayed through the validators and the read-back as they
 * are now, so a change to either shows its effect on a real session as a
 * diff rather than an argument. The recorded prefixes — every one of these
 * plans voided whole at action.1 for a redundant taskStart, or refused on
 * its score — are what the rules of 2026-10-07 replaced.
 */
interface RecordedStep {
  step: number;
  recorded: { finalDecision: string; overall: number; executePrefix: number; executable: boolean };
  observation: PageObservation;
  openTask: boolean;
  plan: StepPlan;
}

const steps = session as RecordedStep[];
const byStep = (step: number): RecordedStep => {
  const found = steps.find((candidate) => candidate.step === step);
  if (found === undefined) throw new Error(`no recorded step ${step}`);
  return found;
};

const goalOf = (recorded: RecordedStep): string =>
  composeStepGoal({
    mission: MISSION_FIXTURE,
    observation: recorded.observation,
    history: [],
    ledger: {
      openTask: recorded.openTask
        ? { label: 'the open unit', url: recorded.observation.url }
        : null,
      done: 0,
      skipped: 0,
      failed: 0,
      remainingTasks: 1,
    },
    objections: [],
    progress: { criteria: [], settled: [], done: [] },
    pageUnchanged: false,
  });

const validate = (recorded: RecordedStep): ValidationReport[] => {
  const contract = contractOf(BROWSER_STEP.task, goalOf(recorded));
  return [referencesValidator, limitsValidator].map((validator) =>
    validator.validate(recorded.plan, contract),
  );
};

/** The recorded run as the session reads it back, with the validators' word as it is now. */
const readout = (recorded: RecordedStep) => {
  const validation = validate(recorded);
  const refused = validation.filter((report) => report.problems.length > 0);
  const trace = traceOf({
    artifact: recorded.plan,
    ledger: ledger({ validation }),
    decision: decision({
      finalDecision: recorded.recorded.finalDecision as never,
      gates: {
        artifactPresent: true,
        validatorsPassed: refused.length === 0,
        evidenceSufficient: true,
        policyAllowed: true,
      },
      blocking: {
        validators: refused.map((report) => report.validatorId),
        findings: [],
        criteria: [],
      },
      scores: { dimensions: {}, overall: recorded.recorded.overall },
    }),
  });
  return routePlan(runDto(`replay-${recorded.step}`, trace), recorded.step);
};

const cutsAt = (recorded: RecordedStep): string[] =>
  validate(recorded).flatMap((report) =>
    report.problems.map((problem) => `${report.validatorId}@${problem.locationRefs.join(',')}`),
  );

describe('the recorded session of 2026-10-07, replayed through the rules as they are now', () => {
  it('[QL-36] a redundant taskStart no longer voids a plan, and a claim past a mutating action is cut where it stands', () => {
    // Steps 19–21: taskStart (redundant), askFields on the five required
    // fields, Next, taskDone. Recorded: voided whole at action.1. Now: the
    // fields are asked and Next pressed; the claim that would have closed the
    // unit on page 1 of 9 is cut.
    for (const step of [19, 20, 21]) {
      const recorded = byStep(step);
      expect(recorded.recorded.executePrefix).toBe(0);
      expect(cutsAt(recorded)).toEqual(['limits@action.4']);
      expect(readout(recorded)).toMatchObject({ executable: true, executePrefix: 3 });
    }
    // Steps 16 and 18: the job card or Easy Apply click runs; the askFields on
    // buttons behind it is still refused where it stands.
    expect(cutsAt(byStep(16))).toEqual(
      expect.arrayContaining(['references@action.3', 'limits@action.3']),
    );
    expect(readout(byStep(16))).toMatchObject({ executable: true, executePrefix: 2 });
    expect(readout(byStep(18))).toMatchObject({ executable: true, executePrefix: 2 });
    // Step 17 is unchanged: the Easy Apply click runs and the askFields on a button is cut.
    expect(readout(byStep(17))).toMatchObject({ executable: true, executePrefix: 1 });
  });

  it('[QL-36] a plan cut at a position runs up to it whatever the loop scored it, by declared policy', () => {
    // Step 22 was refused on its score alone (44.2, no validator problem).
    // Its closing taskDone now follows a press Enter and is cut, so the five
    // actions before it run — the policy the read-back states, measured here
    // so a change to it shows as a diff.
    const recorded = byStep(22);
    expect(recorded.recorded).toMatchObject({
      finalDecision: 'escalate',
      overall: 44.2,
      executePrefix: 0,
    });
    expect(cutsAt(recorded)).toEqual(['limits@action.6']);
    expect(readout(recorded)).toMatchObject({ executable: true, executePrefix: 5 });
  });
});
