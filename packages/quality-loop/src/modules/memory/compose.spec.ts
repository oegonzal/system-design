import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES } from '../../core/prompting';
import { fromRun } from '../../pipelines/experience-digest/compose';
import { renderGoal as renderRecord } from '../../pipelines/experience-digest/input';
import { sampleDigest, sampleRun } from '../../pipelines/experience-digest/testing';
import { renderGoal as renderQuery } from '../../pipelines/memory-recall/input';
import { samplePack } from '../../pipelines/memory-recall/testing';
import {
  bareGoal,
  buildQuery,
  chunksOf,
  MEMORY_HEADING,
  memoriesToStore,
  queryText,
  readPack,
  withMemory,
} from './compose';
import { confirmed, GOAL, hitOf, passed, traceOf } from './testing';

const hits = [
  hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
  hitOf('record each status transition as a row', 'run-a', 'memory.2'),
  hitOf('dedupe notifications by event id', 'run-b', 'memory.1'),
];

describe('composing a memory run', () => {
  it('[QL-16] the recall query is the goal head under the byte cap, and a maximal query still renders under the goal budget', () => {
    const long = 'x'.repeat(70_000);
    expect(Buffer.byteLength(queryText(long))).toBeLessThanOrEqual(16_000);
    const wide = Array.from({ length: 16 }, (_, index) =>
      hitOf('y'.repeat(1_200), `run-${index}`, 'memory.1'),
    );
    const query = buildQuery(queryText(long), wide);
    expect(query.candidates).toHaveLength(16);
    expect(Buffer.byteLength(renderQuery(query))).toBeLessThan(GOAL_MAX_BYTES);
  });

  it('[QL-16] the bare goal is the goal without the section a memory run appended', () => {
    const composed = withMemory(GOAL, readPack(acceptedRecall(), hits).usable);
    expect(composed).not.toBeNull();
    expect(bareGoal(composed?.goal ?? '')).toBe(GOAL);
    expect(bareGoal(GOAL)).toBe(GOAL);
  });

  it('[QL-16] an accepted pack endorses kept chunks no finding names, strongest support first; anything else endorses nothing', () => {
    const { kept, usable } = readPack(acceptedRecall(), hits);
    expect(kept).toBe(2);
    expect(usable.map((item) => [item.alias, item.support])).toEqual([['m1', 1]]);
    expect(usable[0].hit.source.runId).toBe('run-a');

    const revised = readPack(traceOf({ ...recallInput(), decision: 'revise' }), hits);
    expect(revised).toEqual({ kept: 2, usable: [] });
  });

  it('[QL-16] memory reaches the goal as an advisory section that fits the budget, or not at all', () => {
    const { usable } = readPack(acceptedRecall(), hits);
    const composed = withMemory(GOAL, usable);
    expect(composed?.injected).toBe(1);
    expect(composed?.goal.startsWith(GOAL)).toBe(true);
    expect(composed?.goal).toContain(MEMORY_HEADING);
    expect(composed?.goal).toContain(
      '- [m1] lesson · run run-a · system-design · iteration 1 · decided accept · 2026-09-06 · ref memory.1: serve the list from a store the page owns — serves: availability of the list read; insight: a read path with a single store behind it went down with the POS',
    );

    const tight = GOAL_MAX_BYTES - Buffer.byteLength(GOAL) - 10;
    expect(withMemory(GOAL, usable, Buffer.byteLength(GOAL) + tight)).not.toBeNull();
    expect(withMemory(GOAL, usable, Buffer.byteLength(GOAL))).toBeNull();
    expect(withMemory(GOAL, [])).toBeNull();
  });

  it('[QL-16] an accepted digest endorses memories no finding names, with evidence resolved through its own index', () => {
    const record = fromRun(sampleRun());
    if (record === null) throw new Error('the sample run must compose');
    const goal = renderRecord(record);
    const digest = sampleDigest({
      memories: [
        ...sampleDigest().memories,
        {
          evidence: ['f2'],
          insight: 'Name the fix for a contradiction or escalate it.',
          appliesWhen: 'a critic finds two parts that cannot both hold',
        },
      ],
      unused: ['r2'],
    });
    const trace = traceOf({
      pipeline: 'experience-digest',
      goal,
      artifact: digest,
      locations: ['summary', 'memory.1', 'memory.2', 'f1', 'r1', 'f2', 'r2'],
      findings: [confirmed('run_specific', ['memory.2'])],
    });
    expect(memoriesToStore(trace)).toEqual([
      {
        position: 1,
        insight: digest.memories[0].insight,
        appliesWhen: digest.memories[0].appliesWhen,
        evidence: [
          { kind: 'finding', ref: 'unhandled_failure|flow.1' },
          { kind: 'criterion', ref: 'c1' },
        ],
      },
    ]);
    expect(memoriesToStore({ ...trace, finalDecision: 'revise' })).toEqual([]);
  });

  it('[QL-16] a stored chunk is a lesson addressed by the digest location, carrying the source run as provenance', () => {
    const memories = memoriesToStore(
      traceOf({
        pipeline: 'experience-digest',
        goal: renderRecord(
          fromRun(sampleRun()) ??
            (() => {
              throw new Error('compose');
            })(),
        ),
        artifact: sampleDigest(),
        locations: ['summary', 'memory.1', 'f1', 'r1', 'f2', 'r2'],
      }),
    );
    const [chunk] = chunksOf(
      memories,
      {
        runId: 'run-a',
        pipeline: 'system-design',
        decision: 'accept',
        iteration: 2,
        when: '2026-09-06',
      },
      'digest-1',
      'fake-embedding',
    );
    expect(chunk.source).toEqual({
      runId: 'run-a',
      pipeline: 'system-design',
      kind: 'lesson',
      ref: 'memory.1',
      decision: 'accept',
      iteration: 2,
      when: '2026-09-06',
    });
    expect(chunk.text).toBe(
      `${sampleDigest().memories[0].insight} — applies when ${sampleDigest().memories[0].appliesWhen}`,
    );
    expect(chunk.contentHash).toHaveLength(64);
    expect(chunk.digestRunId).toBe('digest-1');
  });
});

function recallInput() {
  const pack = samplePack();
  return {
    pipeline: 'memory-recall',
    goal: renderQuery(buildQuery(GOAL, hits)),
    artifact: pack,
    locations: ['summary', 'm1', 'm2', 'm3', 'gap.1'],
    criteria: [{ id: 'c1', kind: 'need', statement: 'serve a list from an unreliable upstream' }],
    results: [passed('c1', 'need', ['m1'])],
    findings: [confirmed('irrelevant_chunk', ['m2'])],
  };
}

const acceptedRecall = () => traceOf(recallInput());
