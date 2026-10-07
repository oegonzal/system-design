import {
  bound,
  bounded,
  describeIssue,
  DIAGNOSTIC_DEGRADES,
  type SchemaIssue,
} from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { criterionLengthBound, type RunProgress } from '../contracts';
import { composeController } from '../controllers';
import { describePipeline, type PipelineDefinition } from '../pipeline';
import type { Critic, Evaluator, Producer, ProducerInput, UpstreamEvidenceBundle } from '../ports';
import { createBoundsValidator, createSchemaValidator } from '../stages/schema-validator';
import {
  criterion,
  DRAFT_1,
  DRAFT_2,
  fakeLlm,
  finding,
  result,
  scriptedCritic,
  scriptedEvaluator,
  scriptedProducer,
  scriptedStages,
  sequencedLlm,
  tinyPipeline,
  tinyPolicy,
  type TinyOutput,
} from '../testing';
import { runLoop, runPipeline } from './run-pipeline';

const clock = () => 0;

describe('runLoop', () => {
  it('[QL-9] a lens that consumes findings runs after the first wave and is shown only what it confirmed', async () => {
    const order: string[] = [];
    const seen: UpstreamEvidenceBundle[] = [];
    const critic = scriptedCritic('critic.tiny', [
      [[finding({ criterionIds: ['c1'], rationale: 'the text is thin' })]],
    ]);
    const firstWave: Critic<TinyOutput> = {
      ...critic,
      plan: (ctx) => {
        order.push('critic');
        seen.push(ctx.upstream);
        return critic.plan(ctx);
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
      plan: (ctx) => {
        order.push('evaluator');
        seen.push(ctx.upstream);
        return later.plan(ctx);
      },
    };
    const trace = await runLoop(
      scriptedStages({ critics: [firstWave], evaluators: [secondWave] }),
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
      produce: (input) => {
        inputs.push(input);
        return scriptedProducer([DRAFT_1, DRAFT_2]).produce(input);
      },
    };
    // The first producer call is consumed by the scripted stub above, so script both.
    let call = 0;
    producer.produce = (input) => {
      inputs.push(input);
      return Promise.resolve({
        output: call++ === 0 ? DRAFT_1 : DRAFT_2,
        diagnostic: null,
        model: 'scripted',
        issues: [],
        overruns: [],
      });
    };

    const trace = await runLoop(
      scriptedStages({ producer }),
      tinyPipeline(),
      { goal: 'build it' },
      clock,
    );

    expect(
      trace.iterations.map((iteration) => [iteration.mode, iteration.decision.finalDecision]),
    ).toEqual([
      ['initial', 'revise'],
      ['revise', 'accept'],
    ]);
    expect(trace.stopReason).toBe('accepted');
    expect(trace.bestIteration).toBe(2);
    expect(inputs[1]).toMatchObject({ mode: 'revise', prior: DRAFT_1 });
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
      plan: (ctx: Parameters<typeof critic.plan>[0]) => (lensCalls++, critic.plan(ctx)),
    };
    const trace = await runLoop(
      scriptedStages({ critics: [counted] }),
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

  it('[QL-3] a cutting validator refuses the position it points at and the lenses still judge the whole artifact', async () => {
    // A block means the artifact cannot be trusted by any lens; a cut means
    // one unit is wrong and the rest were planned against what the goal
    // showed — so the lenses run, with the cut already counted, and the
    // decision reads the report as refusing.
    let lensCalls = 0;
    const critic = scriptedCritic('critic.tiny', [[[]]]);
    const counted = {
      ...critic,
      plan: (ctx: Parameters<typeof critic.plan>[0]) => (lensCalls++, critic.plan(ctx)),
    };
    const cutting = {
      id: 'parts',
      gate: 'cut' as const,
      validate: () => ({
        validatorId: 'parts',
        gate: 'cut' as const,
        problems: [{ severity: 'high' as const, locationRefs: ['part.2'], message: 'unlisted' }],
      }),
    };
    const trace = await runLoop(
      scriptedStages({ critics: [counted], validators: [cutting] }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      clock,
    );
    expect(lensCalls).toBe(1);
    const [iteration] = trace.iterations;
    expect(iteration.decision.gates.validatorsPassed).toBe(false);
    expect(iteration.decision.blocking.validators).toEqual(['parts']);
    expect(iteration.decision.finalDecision).toBe('retry');
    expect(iteration.ledger.diagnostics.some((d) => d.detail === 'blocked by a validator')).toBe(
      false,
    );
  });

  it('[QL-9] a provided artifact is judged as iteration 1, and the producer is asked only from iteration 2', async () => {
    let asked = 0;
    const producer: Producer<TinyOutput> = {
      produce: (input) => (asked++, scriptedProducer([DRAFT_2]).produce(input)),
    };
    const judged = await runLoop(
      scriptedStages({ producer }),
      tinyPipeline(),
      { goal: 'g', output: DRAFT_1, maxIterations: 1 },
      clock,
    );
    expect(judged.iterations).toHaveLength(1);
    expect(judged.iterations[0].mode).toBe('provided');
    expect(judged.finalDecision).toBe('revise');
    expect(judged.stopReason).toBe('max-iterations');
    expect(asked).toBe(0);

    const revised = await runLoop(
      scriptedStages({ producer }),
      tinyPipeline(),
      { goal: 'g', output: DRAFT_1, maxIterations: 2 },
      clock,
    );
    expect(revised.iterations.map((iteration) => iteration.mode)).toEqual(['provided', 'revise']);
    expect(asked).toBe(1);
  });

  it('[QL-25] a produced artifact is normalized before the validators; a provided one never is', async () => {
    const seenByNormalize: TinyOutput[] = [];
    const seenByValidator: unknown[] = [];
    const tiny = tinyPipeline();
    const normalizing = tinyPipeline({
      task: {
        ...tiny.task,
        output: {
          ...tiny.task.output,
          normalize: (output) => {
            seenByNormalize.push(output);
            return { ...output, parts: [...new Set(output.parts)] };
          },
        },
      },
    });
    const validators = scriptedStages().validators.map((validator) => ({
      ...validator,
      validate: (artifact: TinyOutput, contract: Parameters<typeof validator.validate>[1]) => {
        seenByValidator.push(artifact);
        return validator.validate(artifact, contract);
      },
    }));
    const duplicated: TinyOutput = { text: 'x', parts: ['a', 'a'] };

    const produced = await runLoop(
      scriptedStages({ validators, producer: scriptedProducer([duplicated]) }),
      normalizing,
      { goal: 'g', maxIterations: 1 },
      clock,
    );
    expect(produced.iterations[0].artifact).toEqual({ text: 'x', parts: ['a'] });
    expect(seenByNormalize).toEqual([duplicated]);
    // The validators, the lenses and the trace all see the normalized value.
    expect(seenByValidator).toEqual([{ text: 'x', parts: ['a'] }]);

    seenByNormalize.length = 0;
    const provided = await runLoop(
      scriptedStages(),
      normalizing,
      { goal: 'g', output: duplicated, maxIterations: 1 },
      clock,
    );
    expect(provided.iterations[0].artifact).toEqual(duplicated);
    expect(seenByNormalize).toEqual([]);
  });

  it('[QL-25] a revision a validator blocked never becomes best, and the next produce is told why it was refused', async () => {
    const inputs: ProducerInput<TinyOutput>[] = [];
    const scripted = scriptedProducer([DRAFT_1, { text: 2 } as never, DRAFT_2]);
    const producer: Producer<TinyOutput> = {
      produce: (input) => {
        inputs.push(input);
        return scripted.produce(input);
      },
    };
    const trace = await runLoop(
      scriptedStages({ producer }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 3 },
      clock,
    );

    expect(trace.iterations.map((iteration) => iteration.decision.finalDecision)).toEqual([
      'revise',
      'retry',
      'accept',
    ]);
    expect(trace.iterations[1].decision.scores.overall).toBe(0);
    expect(trace.bestIteration).toBe(3);
    // Iterations 1 and 2 had nothing refused before them.
    expect(inputs[0].refusals).toEqual([]);
    expect(inputs[1].refusals).toEqual([]);
    // Iteration 3 revises the best (iteration 1) with its remediations — and is
    // told what the schema validator refused in iteration 2.
    expect(inputs[2].mode).toBe('retry');
    expect(inputs[2].remediations).toEqual(trace.iterations[0].remediations);
    expect(inputs[2].refusals).toEqual([
      expect.objectContaining({ subject: { validator: 'schema' }, note: 'not the shape' }),
    ]);
  });

  it('[QL-23] an adopted iteration is iteration 1 verbatim in mode adopted, no stage runs for it, and the loop goes on from its decision', async () => {
    // A recorded iteration: judged by an earlier run, decided revise at 40.
    const earlier = await runLoop(
      scriptedStages({ producer: scriptedProducer([DRAFT_1]) }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      clock,
    );
    const recorded = earlier.iterations[0];
    expect(recorded.decision.finalDecision).toBe('revise');

    const inputs: ProducerInput<TinyOutput>[] = [];
    let lensCalls = 0;
    const critic = scriptedCritic('critic.tiny', [[[]]]);
    const counted = {
      ...critic,
      plan: (ctx: Parameters<typeof critic.plan>[0]) => (lensCalls++, critic.plan(ctx)),
    };
    const scripted = scriptedProducer([DRAFT_2]);
    let derived = 0;
    const stages = scriptedStages({
      critics: [counted],
      // The revision passes both criteria, so it beats the adopted 'partial' on c1.
      evaluators: [
        scriptedEvaluator('evaluator.tiny', [
          [[result({ criterionId: 'c1' }), result({ criterionId: 'c2' })]],
        ]),
      ],
      producer: {
        produce: (input) => {
          inputs.push(input);
          return scripted.produce(input);
        },
      },
      deriveCriteria: (goal) => (derived++, scriptedStages().deriveCriteria(goal)),
    });
    const trace = await runLoop(
      stages,
      tinyPipeline(),
      { goal: 'g', criteria: earlier.contract.criteria, adopted: recorded, maxIterations: 2 },
      clock,
    );

    expect(trace.iterations[0]).toEqual({ ...recorded, iteration: 1, mode: 'adopted' });
    // Nothing ran for iteration 1: no derivation, no producer, no lens.
    expect(derived).toBe(0);
    expect(inputs).toHaveLength(1);
    expect(lensCalls).toBe(1);
    // Iteration 2 revised the adopted artifact against its remediations.
    expect(inputs[0]).toMatchObject({
      mode: 'revise',
      prior: recorded.artifact,
      remediations: recorded.remediations,
      refusals: [],
    });
    expect(trace.iterations[1].mode).toBe('revise');
    expect(trace.bestIteration).toBe(2);
    expect(trace.lessons.length).toBeGreaterThan(0);
  });

  it('[QL-9] publishes the run so far after every iteration — an adopted one before any stage runs — and the trace is the last of them plus its stop', async () => {
    const earlier = await runLoop(
      scriptedStages({ producer: scriptedProducer([DRAFT_1]) }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      clock,
    );
    const events: string[] = [];
    const published: RunProgress<TinyOutput>[] = [];
    const scripted = scriptedProducer([DRAFT_2]);
    const stages = scriptedStages({
      evaluators: [
        scriptedEvaluator('evaluator.tiny', [
          [[result({ criterionId: 'c1' }), result({ criterionId: 'c2' })]],
        ]),
      ],
      producer: {
        produce: (input) => {
          events.push('produce');
          return scripted.produce(input);
        },
      },
    });

    const trace = await runLoop(
      stages,
      tinyPipeline(),
      {
        goal: 'g',
        criteria: earlier.contract.criteria,
        adopted: earlier.iterations[0],
        maxIterations: 2,
      },
      clock,
      (progress) => {
        events.push(`progress ${progress.iterations.length}`);
        published.push(progress as RunProgress<TinyOutput>);
      },
    );

    expect(events).toEqual(['progress 1', 'produce', 'progress 2']);
    // The starting point is listed at once, as the loop stood after it — not yet stopped.
    expect(published[0]).toMatchObject({
      bestIteration: 1,
      finalDecision: 'revise',
      stopReason: null,
      lessons: [],
    });
    expect(published[0].iterations.map((iteration) => iteration.mode)).toEqual(['adopted']);
    expect(trace.stopReason).toBe('accepted');
    expect(published[1]).toEqual({ ...trace, stopReason: null });
  });

  it('[QL-9] stops on a plateau when revisions stop improving', async () => {
    const flat = scriptedEvaluator('evaluator.tiny', [
      [[result({ criterionId: 'c1', result: 'partial' }), result({ criterionId: 'c2' })]],
    ]);
    const trace = await runLoop(
      scriptedStages({
        evaluators: [flat],
        critics: [scriptedCritic('critic.tiny', [[[]]])],
        producer: scriptedProducer([DRAFT_1]),
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

describe('a lost produce', () => {
  /** What a seam names when the producer's reply was refused: one structural fault. */
  const refused: SchemaIssue = {
    code: 'invalid_type',
    path: 'parts',
    at: ['parts'],
    message: 'Invalid input: expected array, received string',
    soft: false,
  };

  const recording = (producer: Producer<TinyOutput>, inputs: ProducerInput<TinyOutput>[]) => ({
    produce: (input: ProducerInput<TinyOutput>) => {
      inputs.push(input);
      return producer.produce(input);
    },
  });

  it('[QL-62] costs its iteration, never the run: decided on the record, then asked again in the same mode from the same best, told every fault it was refused for', async () => {
    const inputs: ProducerInput<TinyOutput>[] = [];
    const trace = await runLoop(
      scriptedStages({
        producer: recording(scriptedProducer([DRAFT_1, null, DRAFT_2], [refused]), inputs),
      }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 3 },
      clock,
    );

    expect(
      trace.iterations.map((iteration) => [iteration.mode, iteration.decision.finalDecision]),
    ).toEqual([
      ['initial', 'revise'],
      ['revise', 'escalate'],
      ['revise', 'accept'],
    ]);
    // The lost iteration is on the record as it was: no artifact, the producer's faults kept.
    const [, lost] = trace.iterations;
    expect(lost.artifact).toBeNull();
    expect(lost.decision.gates.artifactPresent).toBe(false);
    expect(lost.ledger.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: 'producer',
        reason: 'llm-failed',
        facts: { issues: [refused] },
      }),
    );
    // The ask that replaced it revised the same best, with the same remediations — and was told why.
    expect(inputs[2]).toMatchObject({
      mode: 'revise',
      prior: DRAFT_1,
      remediations: trace.iterations[0].remediations,
    });
    expect(inputs[2].refusals).toEqual([
      {
        subject: { schema: 'parts' },
        action: 'retry',
        severity: 'critical',
        targetRefs: [],
        note: describeIssue(refused),
      },
    ]);
    expect(inputs[1].refusals).toEqual([]);
    expect(trace.stopReason).toBe('accepted');
    expect(trace.bestIteration).toBe(3);
  });

  it('[QL-62] a lost first produce is asked again from the goal, and any artifact after it takes the crown', async () => {
    const inputs: ProducerInput<TinyOutput>[] = [];
    const trace = await runLoop(
      scriptedStages({ producer: recording(scriptedProducer([null, DRAFT_1], [refused]), inputs) }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 2 },
      clock,
    );
    expect(trace.iterations.map((iteration) => iteration.mode)).toEqual(['initial', 'initial']);
    expect(inputs[1].refusals.map((note) => note.subject)).toEqual([{ schema: 'parts' }]);
    expect(trace.bestIteration).toBe(2);
    expect(trace.finalDecision).toBe('revise');
    expect(trace.stopReason).toBe('max-iterations');
  });

  it('[QL-62] stops produce-lost once the run lost more than its policy allows, standing on the last decision made on an artifact', async () => {
    const published: RunProgress<TinyOutput>[] = [];
    const trace = await runLoop(
      scriptedStages({ producer: scriptedProducer([DRAFT_1, null]) }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 6 },
      clock,
      (progress) => published.push(progress as RunProgress<TinyOutput>),
    );
    // One lost produce allowed, the second ends it: three iterations of six, no plateau
    // counted for the two that had nothing to improve on.
    expect(trace.iterations.map((iteration) => iteration.decision.finalDecision)).toEqual([
      'revise',
      'escalate',
      'escalate',
    ]);
    expect(trace.stopReason).toBe('produce-lost');
    expect(trace.bestIteration).toBe(1);
    expect(trace.finalDecision).toBe('revise');
    expect(published.map((progress) => progress.finalDecision)).toEqual([
      'revise',
      'revise',
      'revise',
    ]);

    const strict = tinyPipeline({
      policy: { ...tinyPolicy(), loop: { ...tinyPolicy().loop, lostProduces: 0 } },
    });
    const once = await runLoop(
      scriptedStages({ producer: scriptedProducer([DRAFT_1, null]) }),
      strict,
      { goal: 'g', maxIterations: 6 },
      clock,
    );
    expect(once.iterations).toHaveLength(2);
    expect(once.stopReason).toBe('produce-lost');

    // A lost produce on the last iteration ends the run on it too.
    const last = await runLoop(
      scriptedStages({ producer: scriptedProducer([DRAFT_1, null]) }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 2 },
      clock,
    );
    expect(last.stopReason).toBe('produce-lost');
    expect(last.finalDecision).toBe('revise');
  });
});

describe('a size overrun', () => {
  /** The tiny task with its text asked for at 20 characters, accepted to 60. */
  const tiny = tinyPipeline();
  const sized = tinyPipeline({
    task: {
      ...tiny.task,
      output: {
        ...tiny.task.output,
        schema: z.strictObject({ text: bounded.text(bound(20)), parts: z.array(z.string()) }),
      },
    },
  });
  const long: TinyOutput = { text: 'x'.repeat(25), parts: ['a'] };
  const warning = 'text: 25 characters; 20 asked, 60 accepted — noted, not refused';

  it('[QL-47] is a warning, never a block: a provided artifact over its target is judged whole, and decided as if it were not over', async () => {
    const trace = await runLoop(
      scriptedStages({ validators: [createSchemaValidator(), createBoundsValidator()] }),
      sized,
      { goal: 'g', output: long, maxIterations: 1 },
      clock,
    );
    const [iteration] = trace.iterations;
    expect(iteration.artifact).toEqual(long);
    expect(iteration.validation).toEqual([
      { validatorId: 'schema', gate: 'block', problems: [] },
      {
        validatorId: 'bounds',
        gate: 'warn',
        problems: [{ severity: 'info', locationRefs: [], message: warning }],
      },
    ]);
    expect(iteration.decision.gates.validatorsPassed).toBe(true);
    expect(iteration.critics).not.toEqual([]);
    // The warning informs and moves nothing: judged without a bound, the decision is the same.
    const unbounded = await runLoop(
      scriptedStages({ validators: [createSchemaValidator(), createBoundsValidator()] }),
      tinyPipeline(),
      { goal: 'g', output: long, maxIterations: 1 },
      clock,
    );
    expect(unbounded.iterations[0].validation[1].problems).toEqual([]);
    expect(iteration.decision).toEqual(unbounded.iterations[0].decision);
  });

  it('[QL-47] a produced field past its target is an overrun on the producer — recorded once, degrading nothing', async () => {
    const trace = await runPipeline(
      sized,
      { goal: 'g', maxIterations: 1 },
      {
        llm: fakeLlm(
          {
            criteria: [
              { kind: 'must', statement: 'has text' },
              { kind: 'nice', statement: 'has parts' },
            ],
          },
          long,
          { findings: [] },
          {
            results: [
              result({ criterionId: 'c1', locationRefs: [] }),
              result({ criterionId: 'c2', locationRefs: [] }),
            ],
            advisoryVerdict: null,
          },
        ),
        sink: () => undefined,
        now: clock,
      },
    );
    const [iteration] = trace.iterations;
    const overruns = iteration.ledger.diagnostics.filter((d) => d.reason === 'overrun');
    expect(overruns).toEqual([
      {
        stage: 'producer',
        sample: null,
        reason: 'overrun',
        detail: warning,
        facts: {
          overrun: expect.objectContaining({ path: 'text', actual: 25, handling: 'accepted' }),
        },
      },
    ]);
    expect(DIAGNOSTIC_DEGRADES.overrun).toBe(false);
    expect(trace.finalDecision).toBe('accept');
  });

  it('[QL-47] a supplied statement past the target its deriver is asked for is an overrun on the rubric, never a refusal', async () => {
    const { target, ceiling } = criterionLengthBound(tinyPipeline().task);
    const statement = 'y'.repeat(target + 5);
    const trace = await runLoop(
      scriptedStages(),
      tinyPipeline(),
      {
        goal: 'g',
        criteria: [criterion('c1', 'must', statement), criterion('c2', 'nice')],
        maxIterations: 1,
      },
      clock,
    );
    expect(trace.contract.criteria[0].statement).toBe(statement);
    expect(trace.iterations[0].ledger.diagnostics.filter((d) => d.reason === 'overrun')).toEqual([
      expect.objectContaining({
        stage: 'criteria',
        detail: `criteria[0].statement: ${(target + 5).toLocaleString('en-US')} characters; ${target} asked, ${ceiling} accepted — noted, not refused`,
      }),
    ]);
  });
});

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

describe('an attempt judged and not better than the best', () => {
  const DRAFT_3: TinyOutput = { text: 'third', parts: ['a', 'b'] };
  const SETBACKS =
    '# Your last attempt was judged and did not beat the best — its defects; do not repeat them';

  /** Three iterations the fake model answers in order: a best, an attempt that falls short of it, an accept. */
  const run = async (consumes: PipelineDefinition<TinyOutput>['producer']['consumes']) => {
    const exchanges: LlmExchange[] = [];
    const llm = sequencedLlm(
      DRAFT_1,
      DRAFT_2,
      DRAFT_3,
      { findings: [finding({ rationale: 'the text is thin' })] },
      {
        findings: [
          finding({ rationale: 'the text is still thin' }),
          finding({
            type: 'wrong',
            severity: 'high',
            locationRefs: ['part.2'],
            rationale: 'the second part contradicts the text',
          }),
        ],
      },
      { findings: [] },
      {
        results: [result({ criterionId: 'c1' }), result({ criterionId: 'c2', result: 'partial' })],
        advisoryVerdict: null,
      },
      {
        results: [result({ criterionId: 'c1' }), result({ criterionId: 'c2', result: 'partial' })],
        advisoryVerdict: null,
      },
      {
        results: [result({ criterionId: 'c1' }), result({ criterionId: 'c2' })],
        advisoryVerdict: null,
      },
    );
    const definition = tinyPipeline({ producer: { ...tinyPipeline().producer, consumes } });
    const trace = await runPipeline(
      definition,
      { goal: 'g', criteria: [criterion('c1'), criterion('c2', 'nice')], maxIterations: 3 },
      { llm, sink: (exchange) => exchanges.push(exchange), now: clock },
    );
    const prompts = exchanges
      .filter((exchange) => exchange.scope === 'producer')
      .map((exchange) => exchange.user);
    return { trace, prompts };
  };

  it("[QL-56] briefs the next produce with what its judges confirmed, and the best's own findings are named once", async () => {
    const { trace, prompts } = await run(['criteria', 'setbacks']);

    expect(
      trace.iterations.map((iteration) => [iteration.mode, iteration.decision.finalDecision]),
    ).toEqual([
      ['initial', 'revise'],
      ['revise', 'revise'],
      ['revise', 'accept'],
    ]);
    // Iteration 2 was judged, fell short and left iteration 1 the best.
    expect(trace.iterations[1].decision.scores.overall).toBeLessThan(
      trace.iterations[0].decision.scores.overall,
    );
    expect(trace.iterations[1].ledger.findings.map((found) => found.key)).toEqual([
      'wrong|part.2',
      'gap|text',
    ]);
    expect(prompts).toHaveLength(3);
    // The second ask revised the best it had just made: nothing fell short yet.
    expect(prompts[1]).not.toContain(SETBACKS);

    // The third ask revises iteration 1 with iteration 1's remediations — and
    // hears what iteration 2's judges found, less what those already name.
    const third = prompts[2];
    expect(third).toContain('[text] first');
    const setbacks = third.slice(third.indexOf(SETBACKS));
    expect(third.indexOf(SETBACKS)).toBeGreaterThan(third.indexOf('# Remediations to apply'));
    expect(setbacks).toContain('- [high] the second part contradicts the text\n');
    // The finding iteration 1 already carries is said once, in its own words.
    expect(third.match(/the text is thin/g)).toHaveLength(1);
    expect(third).not.toContain('the text is still thin');
  });

  it('[QL-56] an ask after the best itself, or after an attempt refused before any judge read it, hears of no setback', async () => {
    const inputs: ProducerInput<TinyOutput>[] = [];
    const scripted = scriptedProducer(
      [DRAFT_1, null, { text: 2 } as never, DRAFT_2],
      [{ code: 'invalid_type', path: 'parts', at: ['parts'], message: 'not a list', soft: false }],
    );
    const trace = await runLoop(
      scriptedStages({
        producer: {
          produce: (input) => {
            inputs.push(input);
            return scripted.produce(input);
          },
        },
        critics: [scriptedCritic('critic.tiny', [[[finding()]]])],
      }),
      tinyPipeline(),
      { goal: 'g', maxIterations: 4 },
      clock,
    );
    expect(trace.iterations.map((iteration) => iteration.decision.finalDecision)).toEqual([
      'revise',
      'escalate',
      'retry',
      expect.any(String),
    ]);
    expect(inputs.map((input) => input.setbacks)).toEqual([[], [], [], []]);
    // The two refused attempts were named — as refusals, not as setbacks.
    expect(inputs[2].refusals).toEqual([expect.objectContaining({ subject: { schema: 'parts' } })]);
    expect(inputs[3].refusals).toEqual([
      expect.objectContaining({ subject: { validator: 'schema' } }),
    ]);
  });

  it('[QL-56] a producer that does not consume setbacks is briefed exactly as before', async () => {
    const { trace, prompts } = await run(['criteria']);
    expect(trace.iterations.map((iteration) => iteration.decision.finalDecision)).toEqual([
      'revise',
      'revise',
      'accept',
    ]);
    expect(prompts[2]).not.toContain(SETBACKS);
    expect(prompts[2]).not.toContain('contradicts');
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
