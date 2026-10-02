import type { QualityRunDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { toRunDto } from '../../../core/contracts';
import { confirmed, evidence, ledger, traceOf } from '../../../core/testing';
import { readIndex, MAX_CANDIDATES } from '../../../pipelines/memory-recall/input';
import { InMemoryMemoryStore, vectorOf } from '../../../modules/memory/testing';
import { contentHash, type MemoryPorts, type QueryProbes, type StoredChunk } from '../ports';
import { childRun, memoryContext, memoryPorts } from '../steps.testing';
import { ACCEPT_AT, acceptedRecall, GOAL } from '../testing';
import { focusLines, focusOf } from './focus';
import { recallMemory } from './recall-memory';

/** The adopted iteration's defect the recall should find a lesson for. */
const DEFECT = confirmed({
  key: 'unhandled_failure|node.3',
  type: 'unhandled_failure',
  severity: 'high',
  rationale: 'No fallback is described for a cache outage on the redirect path.',
});

const focus = () => {
  const [iteration] = traceOf({
    ledger: ledger({
      findings: [DEFECT],
      criteria: [evidence({ criterionId: 'c1', result: 'fail' })],
    }),
  }).iterations;
  return focusOf({
    runId: 'run-adopted',
    iteration,
    criteria: [{ id: 'c1', kind: 'functional', statement: 'Redirect within 50 ms at p99.' }],
  });
};

/** A stored lesson, indexed under the texts given — the fake embeds equal texts equally. */
const lesson = (
  text: string,
  condition: string,
  lessonKey: string,
  runId: string,
): StoredChunk => ({
  text,
  keys: { condition, lesson: lessonKey },
  contentHash: contentHash(text),
  source: {
    runId,
    pipeline: 'system-design-canvas',
    kind: 'lesson',
    ref: 'memory.1',
    decision: 'revise',
    iteration: 2,
    when: '2026-10-02',
  },
  evidence: [],
  digestRunId: null,
  model: 'fake-embedding',
  vectors: { condition: vectorOf(condition), lesson: vectorOf(lessonKey) },
});

/**
 * A store where the goal alone fills every candidate slot: more lessons than
 * a recall takes, each indexed under the goal itself, and one lesson indexed
 * under the adopted iteration's defect — which a search for the goal ranks
 * below all of them.
 */
async function crowdedStore(defectLine: string): Promise<InMemoryMemoryStore> {
  const store = new InMemoryMemoryStore();
  const crowd = Array.from({ length: MAX_CANDIDATES + 4 }, (_, index) =>
    lesson(`An unrelated lesson about the prompt, number ${index}.`, GOAL, GOAL, `run-${index}`),
  );
  for (const chunk of crowd) await store.replaceRunChunks(chunk.source.runId, [chunk]);
  const fix = lesson(
    'Serve redirects from the database when the cache is down — applies when a cache fronts a hot read.',
    defectLine,
    defectLine,
    'run-lesson',
  );
  await store.replaceRunChunks('run-lesson', [fix]);
  return store;
}

const recallWith = async (ports: MemoryPorts, withFocus: boolean) => {
  const goals: string[] = [];
  const recalled = await recallMemory(ports, {
    goal: GOAL,
    store: memoryContext().store,
    acceptAt: ACCEPT_AT,
    execute: (input) => {
      goals.push(input.goal);
      return Promise.resolve(
        toRunDto(childRun('memory-recall', acceptedRecall())) as QualityRunDto,
      );
    },
    focus: withFocus ? focus() : null,
  });
  return { recalled, query: goals[0] ?? '' };
};

describe('a recall focused on the iteration a coach starts from', () => {
  it('[QL-34] searches the adopted iteration’s defects and hands them to the curator in their own section', async () => {
    const { recalled, query } = await recallWith(memoryPorts(), true);
    expect(recalled.status).toBe('complete');
    if (recalled.status === 'complete') {
      // The goal, then one probe per defect and criterion short of a pass.
      expect(recalled.counts.probes).toBe(1 + focusLines(focus()).length);
    }
    expect(query).toContain('## What is wrong now');
    for (const [position, line] of focusLines(focus()).entries()) {
      expect(query).toContain(`- [d${position + 1}] ${line}`);
    }
    expect(query).toContain(
      'unhandled failure (high): No fallback is described for a cache outage',
    );
    expect(query).toContain('c1 fail: Redirect within 50 ms at p99.');
  });

  it('[QL-34] a lesson matching an adopted defect is retrieved over an unrelated one the goal alone would rank first', async () => {
    const [defectLine] = focusLines(focus());
    const candidatesOf = async (withFocus: boolean) => {
      const store = await crowdedStore(defectLine ?? '');
      const { query } = await recallWith(memoryPorts({ store }), withFocus);
      return readIndex(query)?.candidates.map((candidate) => candidate.source.runId) ?? [];
    };

    const bare = await candidatesOf(false);
    expect(bare).toHaveLength(MAX_CANDIDATES);
    expect(bare).not.toContain('run-lesson');

    const focused = await candidatesOf(true);
    expect(focused).toHaveLength(MAX_CANDIDATES);
    expect(focused).toContain('run-lesson');
    // It took a slot one of the unrelated lessons held.
    expect(bare.filter((runId) => !focused.includes(runId))).toHaveLength(1);
  });

  it('[QL-34] with no focus it is the memory orchestrator’s recall over the goal alone', async () => {
    const { recalled, query } = await recallWith(memoryPorts(), false);
    expect(query).not.toContain('## What is wrong now');
    if (recalled.status === 'complete') expect(recalled.counts.probes).toBe(1);
  });

  it('[QL-34] hands the probe deriver the same defects, so its conditions reach for what is wrong now', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    const probes: QueryProbes = {
      derive: (_goal, focus) => {
        asked.push(focus);
        return Promise.resolve([]);
      },
    };
    await recallWith(memoryPorts({ probes }), true);
    await recallWith(memoryPorts({ probes }), false);
    expect(asked).toEqual([focusLines(focus()), []]);
  });
});
