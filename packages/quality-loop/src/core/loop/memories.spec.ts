import { mayProduce } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { MEMORIES_HEADING } from '../stages/prompting';
import { result, sequencedLlm, tinyPipeline } from '../testing';
import { runPipeline } from './run-pipeline';

const clock = () => 0;

const MEMORIES = [
  { ref: 'm1', text: 'Cache the read path before sharding it.' },
  { ref: 'm2', text: 'Name the failure the queue absorbs.' },
];

/** A pipeline whose producer declares it is briefed with memories. */
const briefed = () => {
  const base = tinyPipeline();
  return tinyPipeline({ producer: { ...base.producer, consumes: ['criteria', 'memories'] } });
};

/** Iteration 1 judges c1 partial and revises; iteration 2 passes it — two producer calls. */
const revisingModel = () =>
  sequencedLlm(
    { criteria: [{ kind: 'must', statement: 'has text' }] },
    { text: 'made', parts: ['one'] },
    { findings: [] },
    {
      results: [result({ criterionId: 'c1', result: 'partial', locationRefs: ['text'] })],
      advisoryVerdict: null,
    },
    { results: [result({ criterionId: 'c1', locationRefs: ['text'] })], advisoryVerdict: null },
  );

/** Everything a stage told the model, system and user both. */
const promptOf = (exchange: LlmExchange): string => `${exchange.system}\n${exchange.user}`;

describe('advisory memories', () => {
  it('[QL-32] reach the producer on every call it makes and no other stage, though the run was handed them', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      briefed(),
      { goal: 'Make a thing.', maxIterations: 2, memories: MEMORIES },
      { llm: revisingModel(), sink: (exchange) => exchanges.push(exchange), now: clock },
    );
    expect(trace.iterations.map((iteration) => iteration.mode)).toEqual(['initial', 'revise']);

    const producer = exchanges.filter((exchange) => exchange.scope === 'producer');
    expect(producer).toHaveLength(2);
    for (const call of producer) {
      expect(call.user).toContain(MEMORIES_HEADING);
      expect(call.user).toContain('- [m1] Cache the read path before sharding it.');
      expect(call.user).toContain('- [m2] Name the failure the queue absorbs.');
    }

    // The deriver, every critic and every evaluator: not the heading, not a word of a lesson.
    const others = exchanges.filter((exchange) => exchange.scope !== 'producer');
    expect(new Set(others.map((exchange) => exchange.scope.split('.s')[0]))).toEqual(
      new Set(['criteria', 'critic.tiny', 'evaluator.tiny']),
    );
    for (const call of others) {
      expect(promptOf(call)).not.toContain(MEMORIES_HEADING);
      expect(promptOf(call)).not.toMatch(/sharding|queue absorbs/);
    }
    // Nor are they part of the contract a lens or a reader of the trace is judged against.
    expect(JSON.stringify(trace.contract)).not.toMatch(/sharding|queue absorbs/);
  });

  it('[QL-32] a run handed memories its producer does not consume is refused before any stage runs', async () => {
    const exchanges: LlmExchange[] = [];
    await expect(
      runPipeline(
        tinyPipeline(),
        { goal: 'Make a thing.', memories: MEMORIES },
        { llm: revisingModel(), sink: (exchange) => exchanges.push(exchange), now: clock },
      ),
    ).rejects.toThrow(/producer does not consume memories/);
    expect(exchanges).toEqual([]);
  });

  it('[QL-32] a producer that consumes memories and was handed none is told nothing about memory', async () => {
    const exchanges: LlmExchange[] = [];
    await runPipeline(
      briefed(),
      { goal: 'Make a thing.', maxIterations: 1 },
      { llm: revisingModel(), sink: (exchange) => exchanges.push(exchange), now: clock },
    );
    const producer = exchanges.find((exchange) => exchange.scope === 'producer');
    expect(producer?.user).toContain('# Goal');
    expect(producer?.user).not.toContain(MEMORIES_HEADING);
  });
});

describe('whether a run can ever call its producer', () => {
  const ARTIFACT = { text: 'given', parts: ['one'] };

  /** Run the briefed pipeline and count the producer's calls. */
  const producerCalls = async (input: Parameters<typeof runPipeline>[1]) => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(briefed(), input, {
      llm: revisingModel(),
      sink: (exchange) => exchanges.push(exchange),
      now: clock,
    });
    return {
      trace,
      calls: exchanges.filter((exchange) => exchange.scope === 'producer').length,
    };
  };

  it('[QL-32] the contract’s mayProduce agrees with the loop: no producer call is ever made when it says none can be', async () => {
    const goal = 'Make a thing.';
    const first = await producerCalls({ goal, maxIterations: 1 });
    const criteria = first.trace.contract.criteria;
    const cases = [
      // Produces from nothing: iteration 1 calls the producer.
      { input: { goal, maxIterations: 1 }, adopted: false, produces: true },
      // A supplied artifact, judged once and never revised.
      { input: { goal, output: ARTIFACT, maxIterations: 1 }, adopted: false, produces: false },
      // A supplied artifact with room to revise it: iteration 2 produces.
      { input: { goal, output: ARTIFACT, maxIterations: 2 }, adopted: false, produces: true },
      // An adopted iteration, taken as it is and never revised.
      {
        input: { goal, criteria, adopted: first.trace.iterations[0], maxIterations: 1 },
        adopted: true,
        produces: false,
      },
    ];
    for (const { input, adopted, produces } of cases) {
      const said = mayProduce({
        outputProvided: 'output' in input,
        adoptedFrom: adopted ? { runId: 'earlier', iteration: 1 } : null,
        maxIterations: input.maxIterations,
      });
      expect(said, JSON.stringify(input)).toBe(produces);
      const { calls } = await producerCalls(input);
      if (produces) expect(calls, JSON.stringify(input)).toBeGreaterThan(0);
      else expect(calls, JSON.stringify(input)).toBe(0);
    }
  });
});
