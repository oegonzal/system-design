import { routeToolPlan } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { fakeLlm, runDto, sequencedLlm } from '../../core/testing';
import { TOOL_STEP } from './definition';
import {
  finish,
  listItems,
  observedGoal,
  samplePlan,
  sessionCriteria,
  toolGoal,
  updateItem,
} from './testing';

const result = (criterionId: string, locationRefs: string[] = ['assessment']) => ({
  criterionId,
  result: 'pass',
  confidence: 'high',
  locationRefs,
  rationale: 'the plan does what the observations allow',
});
const results = {
  results: [result('c1', ['call.1']), result('c2'), result('c3')],
  advisoryVerdict: null,
};
/** The evaluator bears the safety critic out: the stop criterion the critic cites, failed. */
const resultsFailingStop = {
  results: [
    result('c1', ['call.1']),
    {
      ...result('c2', ['call.1']),
      result: 'fail',
      rationale: 'the list could not be read twice and the plan reads it again',
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
      locationRefs: ['call.1'],
      criterionIds: ['c2'],
      rationale:
        'two observations in a row say the list could not be read; the plan reads it again instead of finishing service-down',
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
      locationRefs: ['call.2'],
      criterionIds: ['c1'],
      rationale: 'noting an item before the list was read skips the first step',
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

describe('the tool-step loop', () => {
  it('[QL-72] [QL-5] a missed stop the evaluator bears out gates the plan: the loop decides against it after one iteration, and the session does not execute it', async () => {
    const exchanges: LlmExchange[] = [];
    // Each critic's schema offers only the types it owns, and the sequenced
    // fake hands every request the first canned reply that parses against it:
    // the mission critic cannot carry a missed_stop, so it takes `clean`, and
    // the safety critic takes the finding.
    const trace = await runPipeline(
      TOOL_STEP,
      { goal: toolGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(samplePlan(), missedStop, clean, resultsFailingStop), exchanges),
    );

    // The rubric was supplied, so the deriver never ran: producer, two critics, one evaluator.
    expect(exchanges.filter((exchange) => exchange.scope === 'criteria')).toHaveLength(0);
    expect(exchanges).toHaveLength(4);
    expect(trace.contract.criteria.map((criterion) => criterion.id)).toEqual(['c1', 'c2', 'c3']);
    // The evaluator judged beside the critics and was never shown what they found.
    expect(
      exchanges.some((exchange) => exchange.user.includes('# Confirmed upstream defects')),
    ).toBe(false);
    // No model is shown the index.
    expect(exchanges.every((exchange) => !exchange.user.includes('## Index'))).toBe(true);

    expect(trace.iterations).toHaveLength(1);
    const [only] = trace.iterations;
    expect(only.validation.every((report) => report.problems.length === 0)).toBe(true);
    expect(only.locations.map((location) => location.id)).toEqual(['assessment', 'call.1']);
    expect(only.ledger.findings).toMatchObject([
      { key: 'missed_stop|call.1', lenses: ['critic.safety'], hits: 1, criterionIds: ['c2'] },
    ]);
    expect(only.decision.gates.policyAllowed).toBe(false);
    expect(only.decision.finalDecision).toBe('revise');
    expect(trace.finalDecision).toBe('revise');
    expect(trace.stopReason).toBe('max-iterations');

    const readout = routeToolPlan(runDto('step-run', trace), 1);
    expect(readout.plan).toEqual(samplePlan());
    expect(readout.executable).toBe(false);
    expect(readout.executePrefix).toBe(0);
    expect(readout.reason).toContain('call.1 was faulted');
    // What blocked travels as the objections: the finding, and the criterion it was borne out by.
    expect(readout.objections.map((objection) => objection.from)).toEqual(['missed_stop', 'c2']);
  });

  it('[QL-72] [QL-5] a missed stop the evaluator does not bear out is priced and never a veto, so the plan is not refused on it', async () => {
    const trace = await runPipeline(
      TOOL_STEP,
      { goal: toolGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(samplePlan(), missedStop, clean, results)),
    );
    const [only] = trace.iterations;
    expect(only.ledger.findings.map((finding) => finding.key)).toEqual(['missed_stop|call.1']);
    expect(only.decision.gates.policyAllowed).toBe(true);
    expect(only.decision.blocking.findings).toEqual([]);
    expect(only.decision.scores.dimensions['safety']).toBeLessThan(100);
    const readout = routeToolPlan(runDto('contested', trace), 1);
    expect(readout.executable).toBe(true);
    expect(readout.objections).toEqual([]);
  });

  it('[QL-72] an accepted plan runs whole: what the judges said is advice on the record, neither a veto nor an objection', async () => {
    const two = samplePlan([listItems(), updateItem()]);
    const faulted = await runPipeline(
      TOOL_STEP,
      { goal: observedGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(two, skipped, clean, results)),
    );
    expect(faulted.finalDecision).toBe('accept');
    expect(faulted.iterations[0].ledger.findings.map((finding) => finding.key)).toEqual([
      'skipped_step|call.2',
    ]);
    expect(routeToolPlan(runDto('faulted', faulted), 1)).toMatchObject({
      executable: true,
      executePrefix: 2,
      reason: null,
      objections: [],
    });
    const whole = await runPipeline(
      TOOL_STEP,
      { goal: observedGoal(), criteria: sessionCriteria() },
      deps(fakeLlm(two, clean, results)),
    );
    expect(whole.finalDecision).toBe('accept');
    expect(routeToolPlan(runDto('whole', whole), 1)).toMatchObject({
      executable: true,
      executePrefix: 2,
    });
  });

  it('[QL-72] a finish the loop did not accept is held, and a limits cut at a call runs the calls before it', async () => {
    const finishing = samplePlan([], { finish: finish() });
    const held = await runPipeline(
      TOOL_STEP,
      { goal: observedGoal(), criteria: sessionCriteria() },
      deps(sequencedLlm(finishing, missedStop, clean, resultsFailingStop)),
    );
    expect(held.finalDecision).not.toBe('accept');
    expect(routeToolPlan(runDto('held', held), 2).executable).toBe(false);

    const overrun = samplePlan([listItems(), updateItem(), listItems()], {
      calls: [listItems(), { ...updateItem(), argumentsJson: '{"id":"i1"}' }, listItems()],
    });
    const cut = await runPipeline(
      TOOL_STEP,
      { goal: observedGoal(), criteria: sessionCriteria() },
      deps(fakeLlm(overrun, clean, results)),
    );
    const [only] = cut.iterations;
    expect(only.validation.find((report) => report.validatorId === 'limits')?.problems).toEqual([
      { severity: 'high', message: 'note is required and missing', locationRefs: ['call.2'] },
    ]);
    expect(routeToolPlan(runDto('cut', cut), 3)).toMatchObject({
      executable: true,
      executePrefix: 1,
    });
  });
});
