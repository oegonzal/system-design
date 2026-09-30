import { NoopLlmClient, type LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import type { SuccessCriterion } from '@sysdesign/contracts';
import type {
  Critic,
  Evaluator,
  Producer,
  ProducerInput,
  Stages,
  UpstreamEvidenceBundle,
} from '../ports';
import { composeController, STANDARD } from '../controllers';
import { describePipeline } from '../pipeline';
import { runLoop, runPipeline } from './run-pipeline';
import {
  criterion,
  fakeLlm,
  finding,
  result,
  scriptedCritic,
  scriptedEvaluator,
  scriptedProducer,
  tinyPipeline,
  tinyPolicy,
  type TinyOutput,
} from '../testing';

const clock = () => 0;
const deriver = (criteria: SuccessCriterion[] | null) => () =>
  Promise.resolve({
    criteria,
    diagnostic: criteria
      ? null
      : { stage: 'criteria', sample: null, reason: 'llm-disabled' as const, detail: null },
  });

const v1: TinyOutput = { text: 'first', parts: ['a'] };
const v2: TinyOutput = { text: 'second', parts: ['a', 'b'] };

function stages(overrides: Partial<Stages<TinyOutput>> = {}): Stages<TinyOutput> {
  return {
    deriveCriteria: deriver([criterion('c1'), criterion('c2', 'nice')]),
    producer: scriptedProducer([v1, v2]),
    validators: [
      {
        id: 'schema',
        gate: 'block',
        validate: (artifact, contract) => ({
          validatorId: 'schema',
          gate: 'block',
          problems: contract.output.schema.safeParse(artifact).success
            ? []
            : [{ severity: 'critical', locationRefs: [], message: 'not the shape' }],
        }),
      },
    ],
    critics: [scriptedCritic('critic.tiny', [[[finding({ criterionIds: ['c1'] })]], [[]]])],
    evaluators: [
      scriptedEvaluator('evaluator.tiny', [
        [[result({ criterionId: 'c1', result: 'partial' }), result({ criterionId: 'c2' })]],
        [[result({ criterionId: 'c1' }), result({ criterionId: 'c2' })]],
      ]),
    ],
    controller: STANDARD,
    ...overrides,
  };
}

describe('runLoop', () => {
  it('[QL-9] a lens that consumes findings runs after the first wave and is shown only what it confirmed', async () => {
    const order: string[] = [];
    const seen: UpstreamEvidenceBundle[] = [];
    const critic = scriptedCritic('critic.tiny', [
      [[finding({ criterionIds: ['c1'], rationale: 'the text is thin' })]],
    ]);
    const firstWave: Critic<TinyOutput> = {
      ...critic,
      run: (ctx) => {
        order.push('critic');
        seen.push(ctx.upstream);
        return critic.run(ctx);
      },
    };
    const later = scriptedEvaluator(
      'evaluator.tiny',
      [[[result({ criterionId: 'c1', result: 'partial' }), result({ criterionId: 'c2' })]]],
      null,
      ['findings'],
    );
    const secondWave: Evaluator<TinyOutput> = {
      ...later,
      run: (ctx) => {
        order.push('evaluator');
        seen.push(ctx.upstream);
        return later.run(ctx);
      },
    };
    const trace = await runLoop(
      stages({ critics: [firstWave], evaluators: [secondWave] }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      clock,
    );
    expect(order).toEqual(['critic', 'evaluator']);
    // the first wave is shown nothing
    expect(seen[0]).toEqual({ findings: [], results: [] });
    // the second is shown the CONFIRMED finding, with the critic's words, and no unsettled criteria
    expect(seen[1].findings).toEqual([
      expect.objectContaining({
        key: 'gap|text',
        criterionIds: ['c1'],
        rationale: 'the text is thin',
      }),
    ]);
    expect(seen[1].results).toEqual([]);
    // and the final ledger holds both waves
    const [only] = trace.iterations;
    expect(only.ledger.findings).toHaveLength(1);
    expect(only.ledger.criteria.map((evidence) => evidence.result)).toEqual(['partial', 'pass']);
  });

  it('[QL-9] revises with the selected remediations, keeps the best by a strict-better gate, and stops on accept', async () => {
    const inputs: ProducerInput<TinyOutput>[] = [];
    const producer: Producer<TinyOutput> = {
      enabled: true,
      produce: (input) => {
        inputs.push(input);
        return scriptedProducer([v1, v2]).produce(input);
      },
    };
    // The first producer call is consumed by the scripted stub above, so script both.
    let call = 0;
    producer.produce = (input) => {
      inputs.push(input);
      return Promise.resolve({
        output: call++ === 0 ? v1 : v2,
        diagnostic: null,
        model: 'scripted',
      });
    };

    const trace = await runLoop(stages({ producer }), tinyPipeline(), { goal: 'build it' }, clock);

    expect(
      trace.iterations.map((iteration) => [iteration.mode, iteration.decision.finalDecision]),
    ).toEqual([
      ['initial', 'revise'],
      ['revise', 'accept'],
    ]);
    expect(trace.stopReason).toBe('accepted');
    expect(trace.bestIteration).toBe(2);
    expect(inputs[1]).toMatchObject({ mode: 'revise', prior: v1 });
    expect(inputs[1].remediations.map((note) => note.note)).toEqual([
      'criterion c1: it is there',
      'something is missing',
    ]);
    // The producer improves against reasons, never against a number.
    expect(JSON.stringify(inputs)).not.toContain('overall');
    expect(trace.lessons).toEqual([
      expect.objectContaining({ kind: 'resolved', subject: 'gap|text' }),
      expect.objectContaining({ kind: 'improved', subject: 'c1' }),
    ]);
  });

  it('[QL-3] a blocking validator skips every lens and yields retry', async () => {
    let lensCalls = 0;
    const critic = scriptedCritic('critic.tiny', [[[]]]);
    const counted = {
      ...critic,
      run: (ctx: Parameters<typeof critic.run>[0]) => (lensCalls++, critic.run(ctx)),
    };
    const trace = await runLoop(
      stages({ critics: [counted] }),
      tinyPipeline(),
      { goal: 'g', output: { text: 1 }, maxIterations: 1 },
      clock,
    );
    expect(lensCalls).toBe(0);
    expect(trace.iterations[0].decision.finalDecision).toBe('retry');
    expect(trace.iterations[0].ledger.diagnostics).toEqual([
      expect.objectContaining({
        stage: 'lenses',
        reason: 'not-applicable',
        detail: 'blocked by a validator',
      }),
    ]);
    expect(trace.stopReason).toBe('max-iterations');
  });

  it('[QL-9] a provided artifact is judged; with the producer off the loop stops as producer-unavailable', async () => {
    const trace = await runLoop(
      stages({ producer: { enabled: false, produce: () => Promise.reject(new Error('never')) } }),
      tinyPipeline(),
      { goal: 'g', output: v1 },
      clock,
    );
    expect(trace.iterations).toHaveLength(1);
    expect(trace.iterations[0].mode).toBe('provided');
    expect(trace.finalDecision).toBe('revise');
    expect(trace.stopReason).toBe('producer-unavailable');
  });

  it('[QL-9] stops on a plateau when revisions stop improving', async () => {
    const flat = scriptedEvaluator('evaluator.tiny', [
      [[result({ criterionId: 'c1', result: 'partial' }), result({ criterionId: 'c2' })]],
    ]);
    const trace = await runLoop(
      stages({
        evaluators: [flat],
        critics: [scriptedCritic('critic.tiny', [[[]]])],
        producer: scriptedProducer([v1]),
      }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 6 },
      clock,
    );
    expect(trace.iterations).toHaveLength(3);
    expect(trace.stopReason).toBe('plateau');
    expect(trace.bestIteration).toBe(1);
  });
});

describe('runPipeline', () => {
  it('[QL-9] without a live model it escalates honestly: no criteria, llm-disabled diagnostics, no number', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      tinyPipeline(),
      { goal: 'g' },
      { llm: new NoopLlmClient(), sink: (e) => exchanges.push(e), now: clock },
    );
    expect(trace.contract.criteria).toEqual([]);
    expect(trace.finalDecision).toBe('escalate');
    expect(trace.stopReason).toBe('escalated');
    expect(trace.iterations[0].ledger.diagnostics.map((d) => `${d.stage}:${d.reason}`)).toEqual([
      'criteria:llm-disabled',
      'producer:llm-disabled',
      'lenses:not-applicable',
    ]);
    expect(trace.iterations[0].decision.scores).toEqual({
      dimensions: { substance: null, form: null },
      overall: 0,
    });
    expect(exchanges).toEqual([]);

    const judged = await runPipeline(
      tinyPipeline(),
      { goal: 'g', output: v1 },
      { llm: new NoopLlmClient(), sink: () => undefined, now: clock },
    );
    expect(judged.iterations[0].validation.map((report) => report.validatorId)).toEqual(['schema']);
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
      v1,
      { findings: [] },
      { results: [result({ criterionId: 'c1', locationRefs: [] })], advisoryVerdict: null },
      { results: [result({ criterionId: 'c2', locationRefs: [] })], advisoryVerdict: null },
    );
    const definition = tinyPipeline({
      critics: [
        { id: 'critic.a', persona: 'A', samples: 2, maxItems: 4, maxTokens: 100, consumes: [] },
        { id: 'critic.b', persona: 'B', samples: 1, maxItems: 4, maxTokens: 100, consumes: [] },
      ],
      evaluators: [
        {
          id: 'evaluator.must',
          persona: 'M',
          samples: 1,
          maxItems: 4,
          maxTokens: 100,
          criterionKinds: ['must'],
          consumes: [],
        },
        {
          id: 'evaluator.nice',
          persona: 'N',
          samples: 2,
          maxItems: 4,
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
      policy: { ...tinyPolicy(), loop: { maxIterations: 2, plateauAfter: 5, concurrency: 2 } },
    });
    const trace = await runLoop(
      stages({ controller: alwaysRevise }),
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

describe('a supplied rubric', () => {
  const rubric = [criterion('req-1'), criterion('nfr-1', 'nice')];

  it('[QL-20] is used verbatim and the deriver is never asked', async () => {
    let derivations = 0;
    const counting: Stages<TinyOutput>['deriveCriteria'] = () => {
      derivations += 1;
      return Promise.resolve({ criteria: [criterion('c1')], diagnostic: null });
    };
    const trace = await runLoop(
      stages({
        deriveCriteria: counting,
        critics: [
          scriptedCritic('critic.tiny', [
            [[finding({ criterionIds: ['req-1'], rationale: 'the text is thin' })]],
          ]),
        ],
        evaluators: [
          scriptedEvaluator('evaluator.tiny', [
            [
              [
                result({ criterionId: 'req-1', result: 'partial' }),
                result({ criterionId: 'nfr-1' }),
              ],
            ],
          ]),
        ],
      }),
      tinyPipeline(),
      { goal: 'g', criteria: rubric, maxIterations: 1 },
      clock,
    );
    expect(derivations).toBe(0);
    expect(trace.contract.criteria).toEqual(rubric);
    const [iteration] = trace.iterations;
    expect(iteration.ledger.criteria.map((evidence) => evidence.criterionId)).toEqual([
      'req-1',
      'nfr-1',
    ]);
    expect(iteration.ledger.diagnostics.map((diagnostic) => diagnostic.stage)).not.toContain(
      'criteria',
    );
    // The ledger carries the critic's words for a reader; the decision never read them.
    expect(iteration.ledger.findings[0]).toMatchObject({
      criterionIds: ['req-1'],
      rationale: 'the text is thin',
    });
  });

  it('[QL-20] is refused before any stage runs when it does not fit the pipeline', async () => {
    await expect(
      runPipeline(
        tinyPipeline(),
        { goal: 'g', criteria: [{ id: 'c1', kind: 'bogus', statement: 's' }] },
        { llm: fakeLlm(), sink: () => undefined, now: clock },
      ),
    ).rejects.toThrow(/rubric rejected: criterion c1 has kind bogus/);
  });
});
