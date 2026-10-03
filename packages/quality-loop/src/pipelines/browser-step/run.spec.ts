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
  it('[QL-36] a missed stop gates the plan: the loop hands it back as escalate after one iteration, and the session does not execute it', async () => {
    const exchanges: LlmExchange[] = [];
    // The critics share one schema: the mission critic takes the first canned answer, the safety critic the next.
    const trace = await runPipeline(
      BROWSER_STEP,
      { goal: stepGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(samplePlan(), clean, missedStop, results), exchanges),
    );

    // The rubric was supplied, so the deriver never ran: producer, two critics, one evaluator.
    expect(exchanges.filter((exchange) => exchange.scope === 'criteria')).toHaveLength(0);
    expect(exchanges).toHaveLength(4);
    expect(trace.contract.criteria.map((criterion) => criterion.id)).toEqual(['c1', 'c2', 'c3']);

    expect(trace.iterations).toHaveLength(1);
    const [only] = trace.iterations;
    expect(only.validation.every((report) => report.problems.length === 0)).toBe(true);
    expect(only.locations.map((location) => location.id)).toEqual(['assessment', 'action.1']);
    expect(only.ledger.findings).toMatchObject([
      { key: 'missed_stop|action.1', lenses: ['critic.safety'], hits: 1, criterionIds: ['c2'] },
    ]);
    expect(only.decision.gates.policyAllowed).toBe(false);
    expect(only.decision.finalDecision).toBe('escalate');
    expect(only.decision.reason).toContain('missed_stop|action.1');
    expect(only.decision.reason).toContain('handed back');
    expect(trace.finalDecision).toBe('escalate');
    expect(trace.stopReason).toBe('escalated');

    const readout = routePlan(runDto('step-run', trace));
    expect(readout.plan).toEqual(samplePlan());
    expect(readout.executable).toBe(false);
    expect(readout.executePrefix).toBe(0);
    expect(readout.reason).toMatch(/^decided escalate/);
    expect(readout.faults).toEqual([expect.stringContaining('missed_stop')]);
  });

  it('[QL-36] an accepted plan runs up to the first action a confirmed finding names, and a clean one runs whole', async () => {
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
    expect(routePlan(runDto('faulted', faulted))).toMatchObject({
      executable: true,
      executePrefix: 1,
      reason: null,
      faults: [expect.stringContaining('skipped_step')],
    });

    const whole = await runPipeline(
      BROWSER_STEP,
      { goal: stepGoal(), criteria: sessionCriteria() },
      deps(fakeLlm(two, clean, results)),
    );
    expect(whole.finalDecision).toBe('accept');
    expect(routePlan(runDto('whole', whole))).toMatchObject({
      executable: true,
      executePrefix: 2,
      reason: null,
      faults: [],
    });
  });
});
