import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES } from '../../../core/contracts';
import { outputsOf } from '../../../core/outputs';
import { renderGoal as renderQuery } from '../../../pipelines/memory-recall/input';
import { samplePack } from '../../../pipelines/memory-recall/testing';
import {
  ACCEPT_AT,
  acceptedRecall,
  fused,
  GOAL,
  passed,
  readoutTrace,
  recallHits,
} from '../testing';
import { bareGoal, MEMORY_HEADING, withMemory } from './inject';
import { buildQuery, probeSet } from './query';
import { readPack } from './read-pack';

const hits = recallHits();

describe('memory in the goal', () => {
  it('[QL-16] the bare goal is the goal without the section a memory run appended', () => {
    const composed = withMemory(
      GOAL,
      readPack(outputsOf(acceptedRecall()), hits, ACCEPT_AT).usable,
    );
    expect(composed).not.toBeNull();
    expect(bareGoal(composed?.goal ?? '')).toBe(GOAL);
    expect(bareGoal(GOAL)).toBe(GOAL);
  });

  it('[QL-16] strongest support first, and the least supported are dropped first when the budget is short', () => {
    const pack = samplePack({
      kept: [
        { chunk: 'm1', serves: 'one', insight: 'a', caveat: null },
        { chunk: 'm2', serves: 'two', insight: 'b', caveat: null },
        { chunk: 'm3', serves: 'three', insight: 'c', caveat: null },
      ],
      dropped: [],
    });
    const trace = readoutTrace({
      pipeline: 'memory-recall',
      goal: renderQuery(buildQuery(GOAL, probeSet(GOAL, []), fused(hits))),
      artifact: pack,
      locations: ['summary', 'm1', 'm2', 'm3', 'gap.1'],
      criteria: [
        { id: 'c1', kind: 'need', statement: 'one' },
        { id: 'c2', kind: 'need', statement: 'two' },
        { id: 'c3', kind: 'need', statement: 'three' },
      ],
      results: [
        passed('c1', 'need', ['m3']),
        passed('c2', 'need', ['m3']),
        passed('c3', 'need', ['m1']),
      ],
    });
    const { usable } = readPack(outputsOf(trace), hits, ACCEPT_AT);
    expect(usable.map((item) => [item.alias, item.support])).toEqual([
      ['m3', 2],
      ['m1', 1],
      ['m2', 0],
    ]);
    const all = withMemory(GOAL, usable);
    expect(all?.injected).toBe(3);
    const twoFit = Buffer.byteLength(all?.goal ?? '') - 10;
    const fewer = withMemory(GOAL, usable, twoFit);
    expect(fewer?.injected).toBe(2);
    expect(fewer?.goal).toContain('[m3]');
    expect(fewer?.goal).toContain('[m1]');
    expect(fewer?.goal).not.toContain('[m2]');
  });

  it('[QL-16] memory reaches the goal as an advisory section that fits the budget, or not at all', () => {
    const { usable } = readPack(outputsOf(acceptedRecall()), hits, ACCEPT_AT);
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
});
