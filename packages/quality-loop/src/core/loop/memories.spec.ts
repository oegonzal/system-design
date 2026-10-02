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
