import { routePlan } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { fakeLlm, runDto, sequencedLlm } from '../../core/testing';
import { BROWSER_STEP } from './definition';
import { click, samplePlan, sessionCriteria, stepGoal } from './testing';

const result = (criterionId: string, locationRefs: string[] = ['assessment']) => ({
  criterionId,
  result: 'pass',
  confidence: 'high',
  locationRefs,
  rationale: 'the plan does what the page allows',
});
const results = {
  results: [result('c1', ['action.1']), result('c2'), result('c3')],
  advisoryVerdict: null,
};
/** The evaluator bears the safety critic out: the stop criterion the critic cites, failed. */
const resultsFailingStop = {
  results: [
    result('c1', ['action.1']),
    {
      ...result('c2', ['action.1']),
      result: 'fail',
      rationale: 'the limit text is shown and the plan goes on',
    },
    result('c3'),
  ],
  advisoryVerdict: null,
};
const clean = { findings: [] };
const missedStop = {
  findings: [
    {
      type: 'missed_stop',
      severity: 'high',
      confidence: 'high',
      fixability: 'fixable_local',
      locationRefs: ['action.1'],
      criterionIds: ['c2'],
      rationale:
        'the snapshot says no more applications are allowed today; the plan opens a listing instead of terminating limit-reached',
    },
  ],
};
const skipped = {
  findings: [
    {
      type: 'skipped_step',
      severity: 'medium',
      confidence: 'high',
      fixability: 'fixable_local',
      locationRefs: ['action.2'],
      criterionIds: ['c1'],
      rationale: 'paginating before the opened listing is applied to skips the unit of work',
    },
  ],
};

const deps = (llm: ReturnType<typeof fakeLlm>, exchanges: LlmExchange[] = []) => ({
  llm,
  sink: (exchange: LlmExchange) => {
    exchanges.push(exchange);
  },
  now: () => 0,
});

describe('the browser-step loop', () => {
  it('[QL-36] [QL-5] a missed stop the evaluator bears out gates the plan: the loop decides against it after one iteration, and the session does not execute it', async () => {
    const exchanges: LlmExchange[] = [];
    // Each critic's schema offers only the types it owns, and the sequenced
    // fake hands every request the first canned reply that parses against it:
    // the mission critic cannot carry a missed_stop, so it takes `clean`, and
    // the safety critic takes the finding.
    const trace = await runPipeline(
      BROWSER_STEP,
      { goal: stepGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(samplePlan(), missedStop, clean, resultsFailingStop), exchanges),
    );

    // The rubric was supplied, so the deriver never ran: producer, two critics, one evaluator.
    expect(exchanges.filter((exchange) => exchange.scope === 'criteria')).toHaveLength(0);
    expect(exchanges).toHaveLength(4);
    expect(trace.contract.criteria.map((criterion) => criterion.id)).toEqual(['c1', 'c2', 'c3']);
    // The evaluator judged beside the critics and was never shown what they
    // found: its failed c2 is a second reading of the page, not an echo.
    expect(
      exchanges.some((exchange) => exchange.user.includes('# Confirmed upstream defects')),
    ).toBe(false);

    expect(trace.iterations).toHaveLength(1);
    const [only] = trace.iterations;
    expect(only.validation.every((report) => report.problems.length === 0)).toBe(true);
    expect(only.locations.map((location) => location.id)).toEqual(['assessment', 'action.1']);
    expect(only.ledger.findings).toMatchObject([
      { key: 'missed_stop|action.1', lenses: ['critic.safety'], hits: 1, criterionIds: ['c2'] },
    ]);
    expect(only.decision.gates.policyAllowed).toBe(false);
    // The standard controller's word for a fixable blocker; with one iteration
    // the loop ends on its budget, and the session is what reads the verdict.
    expect(only.decision.finalDecision).toBe('revise');
    expect(only.decision.reason).toContain('missed_stop|action.1');
    expect(trace.finalDecision).toBe('revise');
    expect(trace.stopReason).toBe('max-iterations');

    const readout = routePlan(runDto('step-run', trace), 1);
    expect(readout.plan).toEqual(samplePlan());
    expect(readout.executable).toBe(false);
    expect(readout.executePrefix).toBe(0);
    expect(readout.reason).toContain('the first action was faulted');
    // What blocked travels as the objections: the finding, and the criterion it was borne out by.
    expect(readout.objections.map((objection) => objection.from)).toEqual(['missed_stop', 'c2']);
  });

  it('[QL-36] [QL-5] a missed stop the evaluator does not bear out is priced and never a veto, so the plan is not refused on it', async () => {
    // Measured 2026-10-07: one sample of one critic refused a correct first
    // plan for a stop condition the page could not show, having cited the stop
    // criteria the evaluator had marked not applicable. Twenty plans later the
    // session had not moved. The critic's word is evidence; two judges reading
    // one fact apart is what it takes to close a gate.
    const trace = await runPipeline(
      BROWSER_STEP,
      { goal: stepGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(samplePlan(), missedStop, clean, results)),
    );
    const [only] = trace.iterations;
    expect(only.ledger.findings.map((finding) => finding.key)).toEqual(['missed_stop|action.1']);
    expect(only.decision.gates.policyAllowed).toBe(true);
    expect(only.decision.blocking.findings).toEqual([]);
    // Still priced on the safety dimension, so a reader sees it.
    expect(only.decision.scores.dimensions['safety']).toBeLessThan(100);
    // Nothing blocked: the plan stands or falls on its quality alone, and the
    // finding is not an objection the next producer is told to answer.
    const readout = routePlan(runDto('contested', trace), 1);
    expect(readout.objections).toEqual([]);
  });

  it('[QL-36] an accepted plan runs whole: what the judges said is advice on the record, neither a veto nor an objection', async () => {
    const two = samplePlan([
      click('e3', 'open the first listing', 'the listing detail'),
      click('e5', 'go to the next page', 'the second page of results'),
    ]);
    const faulted = await runPipeline(
      BROWSER_STEP,
      { goal: stepGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(two, skipped, clean, results)),
    );
    expect(faulted.finalDecision).toBe('accept');
    expect(faulted.stopReason).toBe('accepted');
    expect(faulted.iterations[0].ledger.findings.map((finding) => finding.key)).toEqual([
      'skipped_step|action.2',
    ]);
    // The controller accepted it and found nothing blocking, so the session
    // does not add a stricter veto of its own: the plan runs, and what the
    // critic said stays on the run's record as advice — not an objection the
    // next plan has to answer. Measured on 2026-10-06, the other way round: a
    // plan accepted at 73.3 against a threshold of 70 never ran because one
    // `low` advisory finding pointed at its first action; and on 2026-10-07,
    // advice carried as objections taught a producer a stop condition the
    // page never showed.
    expect(routePlan(runDto('faulted', faulted), 1)).toMatchObject({
      executable: true,
      executePrefix: 2,
      reason: null,
      objections: [],
    });

    const whole = await runPipeline(
      BROWSER_STEP,
      { goal: stepGoal(), criteria: sessionCriteria() },
      deps(fakeLlm(two, clean, results)),
    );
    expect(whole.finalDecision).toBe('accept');
    expect(routePlan(runDto('whole', whole), 1)).toMatchObject({
      executable: true,
      executePrefix: 2,
      reason: null,
      objections: [],
    });
  });
});
