import { GOAL_BUDGET_BYTES } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import { renderGoal as renderQuery } from '../../../pipelines/memory-recall/input';
import { samplePack } from '../../../pipelines/memory-recall/testing';
import {
  ACCEPT_AT,
  acceptedRecall,
  builtQuery,
  fused,
  GOAL,
  hitOf,
  passed,
  readoutTrace,
  recallHits,
} from '../testing';
import { bareGoal, MEMORY_HEADING } from '../../common';
import { withMemory } from './inject';
import { probeSet } from './query';
import { readPack, type UsableMemory } from './read-pack';

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
      goal: renderQuery(builtQuery(GOAL, probeSet(GOAL, []), fused(hits))),
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

    const tight = GOAL_BUDGET_BYTES - Buffer.byteLength(GOAL) - 10;
    expect(withMemory(GOAL, usable, Buffer.byteLength(GOAL) + tight)).not.toBeNull();
    expect(withMemory(GOAL, usable, Buffer.byteLength(GOAL))).toBeNull();
    expect(withMemory(GOAL, [])).toBeNull();
  });

  it("[QL-55] the curator's words reach the target's goal in the target's terms: its labels are dropped, and a part it named only by them is left unsaid", () => {
    const usable: UsableMemory = {
      alias: 'm1',
      hit: hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
      support: 1,
      // The recall run's own rubric: `c1` is the curator's need, not the target's c1.
      rubric: [{ id: 'c1', kind: 'need', statement: 'serve a list from an unreliable upstream' }],
      kept: {
        chunk: 'm1',
        serves: 'c1/p2',
        insight: 'c1 — a read path with a single store behind it went down with the POS',
        caveat: 'p1',
      },
    };
    const line = withMemory(GOAL, [usable])?.goal.split('\n').at(-1);
    expect(line).toBe(
      '- [m1] lesson · run run-a · system-design · iteration 1 · decided accept · 2026-09-06 · ref memory.1: serve the list from a store the page owns — insight: a read path with a single store behind it went down with the POS',
    );

    // Nothing left of the curator's words: the stored lesson and where it was learned, alone.
    const silent = { ...usable, kept: { ...usable.kept, insight: 'c1', caveat: null } };
    expect(withMemory(GOAL, [silent])?.goal.split('\n').at(-1)).toBe(
      '- [m1] lesson · run run-a · system-design · iteration 1 · decided accept · 2026-09-06 · ref memory.1: serve the list from a store the page owns',
    );
  });

  it("[QL-55] a part left with no letter or digit once its labels are dropped is unsaid, a focus label is one on an unfocused recall too, and the curator's other words stay as written", () => {
    const usable: UsableMemory = {
      alias: 'm1',
      hit: hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
      support: 1,
      rubric: [
        { id: 'c1', kind: 'need', statement: 'serve a list from an unreliable upstream' },
        { id: 'c2', kind: 'need', statement: 'keep the read path available' },
      ],
      kept: {
        chunk: 'm1',
        // Labels only, in a bracket: nothing is left to say, so no `serves: ()`.
        serves: 'c1 (p2, k1)',
        // Words between labels are the curator's own and are not guessed at.
        insight: 'answers c2 and p1 directly',
        // A focus label the target never listed, and the stop it leaves: no `: availability`.
        caveat: 'd1: availability of the read path',
      },
    };
    expect(withMemory(GOAL, [usable])?.goal.split('\n').at(-1)).toBe(
      '- [m1] lesson · run run-a · system-design · iteration 1 · decided accept · 2026-09-06 · ref memory.1: serve the list from a store the page owns — insight: answers and directly; caveat: availability of the read path',
    );
  });

  it('[QL-55] a bracket that held only dropped labels and the words citing them leaves no empty bracket and no space before the stop after it', () => {
    const usable: UsableMemory = {
      alias: 'm1',
      hit: hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
      support: 1,
      rubric: [{ id: 'c1', kind: 'need', statement: 'serve a list from an unreliable upstream' }],
      kept: {
        chunk: 'm1',
        serves: 'the read path (c1)',
        insight: 'guards writes (see p1); keeps reads',
        caveat: null,
      },
    };
    expect(withMemory(GOAL, [usable])?.goal.split('\n').at(-1)).toBe(
      '- [m1] lesson · run run-a · system-design · iteration 1 · decided accept · 2026-09-06 · ref memory.1: serve the list from a store the page owns — serves: the read path; insight: guards writes; keeps reads',
    );
  });
});
