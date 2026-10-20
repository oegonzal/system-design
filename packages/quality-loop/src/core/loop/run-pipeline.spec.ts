import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';
import { composeController } from '../controllers';
import { describePipeline } from '../describe-pipeline';
import { carryParts } from '../contracts';
import {
  DRAFT_1,
  DRAFT_2,
  fakeLlm,
  result,
  scriptedProducer,
  scriptedStages,
  tinyPipeline,
  tinyPolicy,
} from '../testing';
import { runLoop, runPipeline } from './run-pipeline';

const clock = () => 0;

describe('runPipeline', () => {
  it('[QL-9] [QL-62] when every model call fails it escalates honestly: llm-failed diagnostics, no criteria, no invented number, every miss recorded, the produce asked once more', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      tinyPipeline(),
      { goal: 'g' },
      { llm: fakeLlm(), sink: (e) => exchanges.push(e), now: clock },
    );
    expect(trace.contract.criteria).toEqual([]);
    expect(trace.finalDecision).toBe('escalate');
    // The policy allows one lost produce: the second ends the run on it.
    expect(trace.stopReason).toBe('produce-lost');
    expect(trace.iterations.map((iteration) => iteration.mode)).toEqual(['initial', 'initial']);
    expect(trace.iterations[0].ledger.diagnostics.map((d) => `${d.stage}:${d.reason}`)).toEqual([
      'criteria:llm-failed',
      'producer:llm-failed',
      'lenses:not-applicable',
    ]);
    expect(trace.iterations[0].decision.scores).toEqual({
      dimensions: { substance: null, form: null },
      overall: 0,
    });
    // The misses are on the record: nothing is hidden behind an "off" switch.
    expect(exchanges.map((exchange) => [exchange.scope, exchange.outcome])).toEqual([
      ['criteria', 'schema-miss'],
      ['producer', 'schema-miss'],
      ['producer', 'schema-miss'],
    ]);

    const judged = await runPipeline(
      tinyPipeline(),
      { goal: 'g', output: DRAFT_1 },
      { llm: fakeLlm(), sink: () => undefined, now: clock },
    );
    expect(judged.iterations[0].validation.map((report) => report.validatorId)).toEqual([
      'schema',
      'bounds',
    ]);
    expect(judged.iterations[0].decision.gates).toMatchObject({
      validatorsPassed: true,
      evidenceSufficient: false,
    });
  });

  it('[QL-10] attributes every exchange to its lens and sample under concurrent lenses', async () => {
    const exchanges: LlmExchange[] = [];
    const llm = fakeLlm(
      {
        criteria: [
          { kind: 'must', statement: 'has text' },
          { kind: 'nice', statement: 'has parts' },
        ],
      },
      DRAFT_1,
      { findings: [] },
      { results: [result({ criterionId: 'c1', locationRefs: [] })], advisoryVerdict: null },
      { results: [result({ criterionId: 'c2', locationRefs: [] })], advisoryVerdict: null },
    );
    const definition = tinyPipeline({
      critics: [
        { id: 'critic.a', persona: 'A', samples: 2, maxItems: 4, maxTokens: 100 },
        { id: 'critic.b', persona: 'B', samples: 1, maxItems: 4, maxTokens: 100 },
      ],
      evaluators: [
        {
          id: 'evaluator.must',
          persona: 'M',
          samples: 1,
          maxTokens: 100,
          criterionKinds: ['must'],
          consumes: [],
        },
        {
          id: 'evaluator.nice',
          persona: 'N',
          samples: 2,
          maxTokens: 100,
          criterionKinds: ['nice'],
          consumes: [],
        },
      ],
    });
    const trace = await runPipeline(
      definition,
      { goal: 'g', maxIterations: 1 },
      { llm, sink: (e) => exchanges.push(e), now: clock },
    );

    const scopes = exchanges.map((exchange) => `${exchange.scope}#${exchange.ordinal}`).sort();
    expect(scopes).toEqual(
      [
        'criteria#1',
        'producer#1',
        'critic.a.s1#1',
        'critic.a.s2#1',
        'critic.b.s1#1',
        'evaluator.must.s1#1',
        'evaluator.nice.s1#1',
        'evaluator.nice.s2#1',
      ].sort(),
    );
    expect(exchanges.every((exchange) => exchange.outcome === 'ok')).toBe(true);
    expect(trace.iterations[0].ledger.criteria.map((c) => c.result)).toEqual(['pass', 'pass']);
    expect(trace.finalDecision).toBe('accept');
  });
});

describe('a raised bar', () => {
  /** Two criteria of the tiny pipeline's two kinds, judged pass and fail: substance 100, form 0 — overall 60 under the weights 0.6 / 0.4. */
  const sixty = fakeLlm(
    {
      criteria: [
        { kind: 'must', statement: 'has text' },
        { kind: 'nice', statement: 'has parts' },
      ],
    },
    DRAFT_1,
    { findings: [] },
    {
      results: [
        result({ criterionId: 'c1', locationRefs: [] }),
        result({ criterionId: 'c2', result: 'fail', locationRefs: [] }),
      ],
      advisoryVerdict: null,
    },
  );
  /** Three criteria, the two `nice` ones split: substance 100, form 50 — overall 80, the tiny pipeline's own bar. */
  const eighty = fakeLlm(
    {
      criteria: [
        { kind: 'must', statement: 'has text' },
        { kind: 'nice', statement: 'has parts' },
        { kind: 'nice', statement: 'has more parts' },
      ],
    },
    DRAFT_1,
    { findings: [] },
    {
      results: [
        result({ criterionId: 'c1', locationRefs: [] }),
        result({ criterionId: 'c2', locationRefs: [] }),
        result({ criterionId: 'c3', result: 'fail', locationRefs: [] }),
      ],
      advisoryVerdict: null,
    },
  );
  const quiet = { sink: () => undefined, now: clock };

  it('[QL-80] a run may raise its pipeline’s accept threshold: what the pipeline accepts at 80 is revised under a bar of 90, and the bar is on the decision’s record', async () => {
    const own = await runPipeline(
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      { llm: eighty, ...quiet },
    );
    expect(own.iterations[0]?.decision.scores.overall).toBe(80);
    expect(own.finalDecision).toBe('accept');
    expect(own.stopReason).toBe('accepted');

    const raised = await runPipeline(
      tinyPipeline(),
      { goal: 'g', maxIterations: 1, acceptAt: 90 },
      { llm: eighty, ...quiet },
    );
    expect(raised.iterations[0]?.decision.scores.overall).toBe(80);
    expect(raised.finalDecision).toBe('revise');
    expect(raised.stopReason).toBe('max-iterations');
    const gate = raised.iterations[0]?.decision.trace.steps.find(
      (step) => step.factor === 'accept-threshold',
    );
    expect(JSON.stringify(gate)).toContain('below 90');
  });

  it('[QL-80] a bar under the pipeline’s is never taken: the pipeline’s floor stands', async () => {
    const lowered = await runPipeline(
      tinyPipeline(),
      { goal: 'g', maxIterations: 1, acceptAt: 50 },
      { llm: sixty, ...quiet },
    );
    expect(lowered.iterations[0]?.decision.scores.overall).toBe(60);
    expect(lowered.finalDecision).toBe('revise');
  });

  it('[QL-80] an adopted iteration is decided again under this run’s bar: accepted as recorded, revised under 90, verbatim otherwise', async () => {
    const recorded = await runPipeline(
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      { llm: eighty, ...quiet },
    );
    const adopted = recorded.iterations[0];
    if (!adopted) throw new Error('the recorded run has an iteration');
    const again = await runPipeline(
      tinyPipeline(),
      { goal: 'g', maxIterations: 1, criteria: recorded.contract.criteria, adopted },
      { llm: fakeLlm(), ...quiet },
    );
    expect(again.iterations[0]?.mode).toBe('adopted');
    expect(again.iterations[0]?.decision).toEqual(adopted.decision);
    expect(again.finalDecision).toBe('accept');

    const higher = await runPipeline(
      tinyPipeline(),
      { goal: 'g', maxIterations: 1, criteria: recorded.contract.criteria, adopted, acceptAt: 90 },
      { llm: fakeLlm(), ...quiet },
    );
    expect(higher.iterations[0]?.mode).toBe('adopted');
    expect(higher.iterations[0]?.decision.finalDecision).toBe('revise');
    expect(higher.stopReason).toBe('max-iterations');
  });
});

describe('the controller port', () => {
  it('[QL-8] the loop consults the controller the definition declares, whatever it decides', async () => {
    const alwaysRevise = composeController('always-revise', {
      gates: [],
      route: { factor: 'scripted', settle: () => ({ decision: 'revise', reason: 'scripted' }) },
    });
    const definition = tinyPipeline({
      controller: alwaysRevise,
      policy: {
        ...tinyPolicy(),
        loop: { ...tinyPolicy().loop, maxIterations: 2, plateauAfter: 5, concurrency: 2 },
      },
    });
    const trace = await runLoop(
      scriptedStages({ controller: alwaysRevise }),
      definition,
      { goal: 'goal' },
      clock,
    );
    expect(trace.iterations.map((iteration) => iteration.decision.finalDecision)).toEqual([
      'revise',
      'revise',
    ]);
    expect(trace.iterations[0].decision.reason).toBe('scripted');
    expect(trace.iterations[0].decision.trace.steps.map((step) => step.factor)).toEqual([
      'scores',
      'scripted',
    ]);
    expect(trace.stopReason).toBe('max-iterations');
    expect(describePipeline(definition as never).controller.id).toBe('always-revise');
  });
});

describe('a carried part', () => {
  const carriesParts = () => {
    const base = tinyPipeline();
    return tinyPipeline({ task: { ...base.task, carried: ['parts'] } });
  };

  it('[QL-81] a produced revision keeps a carried part exactly as the artifact it revises had it, whatever the reply held', async () => {
    const handedIn = { text: 'first', parts: ['kept'] };
    const trace = await runLoop(
      scriptedStages({ producer: scriptedProducer([DRAFT_2]) }),
      carriesParts(),
      { goal: 'g', output: handedIn, maxIterations: 2 },
      clock,
    );
    expect(trace.iterations.map((iteration) => iteration.mode)).toEqual(['provided', 'revise']);
    expect(trace.iterations[0]?.artifact).toEqual(handedIn);
    expect(trace.iterations[1]?.artifact).toEqual({ text: DRAFT_2.text, parts: ['kept'] });
  });

  it('[QL-81] a part the revised artifact lacks stays absent, and with nothing to revise the reply stands as read', () => {
    const task = { carried: ['note'] };
    expect(carryParts(task, { text: 'a' }, { text: 'b', note: 'invented' })).toEqual({ text: 'b' });
    expect(carryParts(task, null, { text: 'b', note: 'own' })).toEqual({ text: 'b', note: 'own' });
    expect(carryParts({}, { text: 'a', note: 'x' }, { text: 'b' })).toEqual({ text: 'b' });
  });
});
