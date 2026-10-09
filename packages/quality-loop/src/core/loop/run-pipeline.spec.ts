import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';
import { composeController } from '../controllers';
import { describePipeline } from '../describe-pipeline';
import { DRAFT_1, fakeLlm, result, scriptedStages, tinyPipeline, tinyPolicy } from '../testing';
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
