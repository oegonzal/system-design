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
import type { PipelineDefinition } from '../pipeline';
import type { Producer, ProducerInput } from '../ports';
import { createBoundsValidator, createSchemaValidator } from '../stages/schema-validator';
import {
  criterion,
  DRAFT_1,
  DRAFT_2,
  fakeLlm,
  finding,
  result,
  scriptedCritic,
  scriptedProducer,
  scriptedStages,
  sequencedLlm,
  type TinyOutput,
  tinyPipeline,
  tinyPolicy,
} from '../testing';
import { runLoop, runPipeline } from './run-pipeline';

const clock = () => 0;

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
