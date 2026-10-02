import type { QualityRunDto, StartQualityRunRequest } from '@sysdesign/contracts';
import { DisabledEmbeddingClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { toRunDto } from '../../core/contracts';
import { confirmed, evidence, ledger, traceOf } from '../../core/testing';
import { CachedEmbeddings } from '../../orchestrators/memory/embeddings';
import { MEMORY_HEADING } from '../../orchestrators/memory/recall/inject';
import { childRun, memoryPorts } from '../../orchestrators/memory/steps.testing';
import { ACCEPT_AT, GOAL, passed, readoutTrace } from '../../orchestrators/memory/testing';
import { samplePack } from '../../pipelines/memory-recall/testing';
import { RunRecallSlot } from '../runs/recall/run-recall';
import type { RunsService } from '../runs/runs.service';
import { MemoryRunRecall } from './memory-run-recall';
import { InMemoryEmbeddingCache, InMemoryMemoryStore } from './testing';

/** memory-recall as registered, or not: all the adapter asks the runs service is its accept bar. */
const registry = (acceptAt: number | null = ACCEPT_AT): RunsService =>
  ({
    summaryOf: (pipeline: string) =>
      acceptAt === null || pipeline !== 'memory-recall'
        ? undefined
        : { policy: { thresholds: { acceptAt } } },
  }) as unknown as RunsService;

/** The recall run's trace: both stored lessons kept, both supported, nothing faulted. */
const curated = (decision: 'accept' | 'revise' = 'accept') =>
  readoutTrace({
    pipeline: 'memory-recall',
    goal: 'the composed query',
    artifact: samplePack({ dropped: [] }),
    locations: ['summary', 'm1', 'm2', 'gap.1'],
    criteria: [{ id: 'c1', kind: 'need', statement: 'x' }],
    results: [passed('c1', 'need', ['m1', 'm2'])],
    decision,
  });

/** An `execute` that answers with the canned child, recording what it was asked to run. */
const runner = (child: ReturnType<typeof childRun> | null) => {
  const asked: StartQualityRunRequest[] = [];
  const execute = (request: StartQualityRunRequest): Promise<QualityRunDto> => {
    asked.push(request);
    if (child === null) throw new Error('no recall run was expected');
    return Promise.resolve(toRunDto(child));
  };
  return { asked, execute };
};

describe("the memory module's recall for a run's producer", () => {
  it('[QL-32] binds itself into the runs module’s slot, which takes one recall per process', () => {
    const slot = new RunRecallSlot();
    const recall = new MemoryRunRecall(memoryPorts(), registry(), slot);
    expect(slot.bound).toBeNull();
    recall.onModuleInit();
    expect(slot.bound).toBe(recall);
    expect(() => slot.bind(new MemoryRunRecall(memoryPorts(), registry(), slot))).toThrow(
      /already bound/,
    );
  });

  it('[QL-32] hands on what the curator endorsed — its words beside the stored lesson — from the bare goal', async () => {
    const { asked, execute } = runner(childRun('memory-recall', curated()));
    const recall = new MemoryRunRecall(memoryPorts(), registry(), new RunRecallSlot());
    const recalled = await recall.recall(`${GOAL}\n\n${MEMORY_HEADING}\n\n- [m9] stale`, execute);

    expect(asked).toHaveLength(1);
    expect(asked[0].pipeline).toBe('memory-recall');
    expect(asked[0].goal).toContain('# Memory query');
    expect(asked[0].goal).not.toContain('[m9] stale');
    expect(recalled).toMatchObject({
      status: 'recalled',
      reason: null,
      recallRunId: 'memory-recall-run',
      count: 2,
    });
    const [first] = samplePack().kept;
    expect(recalled.lessons[0]).toEqual({
      ref: 'm1',
      serves: first.serves,
      insight: first.insight,
      caveat: first.caveat,
      text: 'serve the list from a store the page owns',
      sourceRunId: 'run-a',
    });
  });

  it('[QL-34] recalls for what is wrong with the iteration a run adopted, and records that focus', async () => {
    const [iteration] = traceOf({
      ledger: ledger({
        findings: [
          confirmed({
            key: 'unhandled_failure|node.3',
            type: 'unhandled_failure',
            severity: 'high',
            rationale: 'No fallback when the order store is down.',
          }),
        ],
        criteria: [evidence({ criterionId: 'c1', result: 'fail' })],
      }),
    }).iterations;
    const base = {
      runId: 'run-adopted',
      iteration,
      criteria: [{ id: 'c1', kind: 'functional', statement: 'List orders newest first.' }],
    };
    const { asked, execute } = runner(childRun('memory-recall', curated()));
    const recall = new MemoryRunRecall(memoryPorts(), registry(), new RunRecallSlot());
    const recalled = await recall.recall(GOAL, execute, base);

    // The curator reads the defects in their own section of its query…
    expect(asked[0].goal).toContain('## What is wrong now');
    expect(asked[0].goal).toContain(
      '- [d1] unhandled failure (high): No fallback when the order store is down.',
    );
    expect(asked[0].goal).toContain('- [d2] c1 fail: List orders newest first.');
    // …and the run records what its recall was focused on.
    expect(recalled).toMatchObject({ status: 'recalled', count: 2 });
    expect(recalled.focus).toEqual({
      runId: 'run-adopted',
      iteration: 1,
      findings: [
        {
          type: 'unhandled_failure',
          severity: 'high',
          rationale: 'No fallback when the order store is down.',
        },
      ],
      criteria: [{ criterionId: 'c1', statement: 'List orders newest first.', result: 'fail' }],
    });

    // A run that adopted nothing recalls for its prompt alone.
    const bare = runner(childRun('memory-recall', curated()));
    const unfocused = await recall.recall(GOAL, bare.execute);
    expect(bare.asked[0].goal).not.toContain('## What is wrong now');
    expect(unfocused.focus).toBeNull();
  });

  it('[QL-32] says why it handed on nothing, empty or skipped, in the closed vocabulary', async () => {
    const recallWith = (
      ports: Parameters<typeof memoryPorts>[0] = {},
      child: ReturnType<typeof childRun> | null = null,
      acceptAt: number | null = ACCEPT_AT,
    ) =>
      new MemoryRunRecall(memoryPorts(ports), registry(acceptAt), new RunRecallSlot()).recall(
        GOAL,
        runner(child).execute,
      );

    expect(await recallWith({}, childRun('memory-recall', curated('revise')))).toMatchObject({
      status: 'empty',
      reason: 'not-accepted',
      recallRunId: 'memory-recall-run',
    });
    expect(await recallWith({ store: new InMemoryMemoryStore() })).toMatchObject({
      status: 'empty',
      reason: 'store-empty',
      recallRunId: null,
    });
    // Curated against no rubric: not a verdict on the lessons, so skipped, not empty.
    const unjudged = curated('revise');
    expect(
      await recallWith(
        {},
        childRun('memory-recall', {
          ...unjudged,
          contract: { ...unjudged.contract, criteria: [] },
        }),
      ),
    ).toMatchObject({ status: 'skipped', reason: 'no-rubric', recallRunId: 'memory-recall-run' });
    expect(await recallWith({}, childRun('memory-recall', null, true))).toEqual({
      status: 'skipped',
      reason: 'run-failed',
      note: 'the model went away',
      recallRunId: 'memory-recall-run',
      count: 0,
      lessons: [],
      focus: null,
    });
    expect(
      await recallWith({
        embedding: { enabled: false, model: null, reason: 'no-key' },
        embeddings: new CachedEmbeddings(
          new DisabledEmbeddingClient('no-key'),
          new InMemoryEmbeddingCache(),
        ),
      }),
    ).toMatchObject({ status: 'skipped', reason: 'embeddings-disabled', note: 'no-key' });
    const dark = new InMemoryMemoryStore();
    dark.unreachable = true;
    expect(await recallWith({ store: dark })).toMatchObject({
      status: 'skipped',
      reason: 'store-unavailable',
      note: 'store unreachable',
    });
    expect(await recallWith({}, null, null)).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'memory-recall',
    });
  });
});
