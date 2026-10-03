import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { toRunDto } from '../../core/contracts';
import { contentHash } from '../../orchestrators/memory/ports';
import { childRun, memoryPorts } from '../../orchestrators/memory/steps.testing';
import { ACCEPT_AT, digestInput, readoutTrace } from '../../orchestrators/memory/testing';
import { fromRun } from '../../pipelines/experience-digest/from-run';
import { renderGoal as renderRecord } from '../../pipelines/experience-digest/input';
import { sampleDigest, sampleRun } from '../../pipelines/experience-digest/testing';
import type { OrchestrationRunRepository } from '../orchestration/ports';
import type { RunsService } from '../runs/runs.service';
import { MemoryService } from './memory.service';
import { InMemoryMemoryStore } from './testing';

/** The digest run a memory run opened over the sample source: its goal is the record, index included. */
const digestRun = (source: QualityRunDto): QualityRunDto => {
  const record = fromRun(source);
  if (record === null) throw new Error('the sample run must compose');
  return toRunDto(
    childRun('experience-digest', readoutTrace(digestInput(sampleDigest(), renderRecord(record)))),
  );
};

const memoryRun = (digestRunId: string, targetRunId: string): OrchestrationRunDto => {
  const step = {
    status: 'complete' as const,
    reason: null,
    note: null,
    counts: {},
    report: null,
    startedAt: null,
    finishedAt: null,
  };
  return {
    orchestrationRunId: crypto.randomUUID(),
    orchestrator: 'memory',
    pipeline: 'system-design',
    status: 'complete',
    startedAt: '2026-09-07T00:00:00.000Z',
    finishedAt: '2026-09-07T00:02:00.000Z',
    request: { ...sampleRun().request, samples: null },
    context: {},
    steps: {
      recall: { ...step, runIds: [] },
      target: { ...step, runIds: [targetRunId] },
      digest: { ...step, runIds: [digestRunId] },
      store: { ...step, runIds: [] },
    },
    error: null,
  };
};

describe('the memory service’s re-index', () => {
  it('[QL-43] re-embeds the digest a memory run already produced, and the chunks it writes carry the source run’s lineage', async () => {
    const source = sampleRun();
    const digest = digestRun(source);
    const record = memoryRun(digest.runId, source.runId);
    const ports = memoryPorts();
    const store = ports.store as InMemoryMemoryStore;
    // A point the run stored before lineage was recorded.
    await store.replaceRunChunks(source.runId, [
      {
        text: 'an earlier lesson',
        keys: { condition: 'earlier', lesson: 'an earlier lesson' },
        contentHash: contentHash('an earlier lesson'),
        source: {
          runId: source.runId,
          pipeline: 'system-design',
          kind: 'lesson',
          ref: 'memory.1',
          decision: 'accept',
          iteration: 2,
          when: '2026-09-06',
        },
        evidence: [],
        digestRunId: digest.runId,
        lineage: null,
        model: 'fake-embedding',
        vectors: { condition: [1, 0, 0, 0, 0, 0, 0, 0], lesson: [1, 0, 0, 0, 0, 0, 0, 0] },
      },
    ]);
    const runs = {
      get: (runId: string) =>
        Promise.resolve(runId === digest.runId ? digest : runId === source.runId ? source : null),
      summary: () => ({ policy: { thresholds: { acceptAt: ACCEPT_AT } } }),
    } as unknown as RunsService;
    const records = {
      find: (id: string) => Promise.resolve(id === record.orchestrationRunId ? record : null),
    } as unknown as OrchestrationRunRepository;

    const outcome = await new MemoryService(runs, ports, records).reindex(
      record.orchestrationRunId,
    );
    expect(outcome).toMatchObject({ status: 'complete', counts: { chunks: 1 } });
    expect(outcome.runIds).toEqual([digest.runId]);
    const stored = [...store.points.values()].filter(
      (chunk) => chunk.source.runId === source.runId,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toContain(sampleDigest().memories[0].insight);
    expect(stored[0].lineage).toEqual({
      judged: { runId: source.runId, iteration: 2 },
      adoptedFrom: null,
      goalHash: contentHash(source.request.goal),
    });
  });

  it('refuses a run that is not a memory run, or one that digested nothing', async () => {
    const source = sampleRun();
    const digest = digestRun(source);
    const undigested = memoryRun(digest.runId, source.runId);
    undigested.steps['digest'] = { ...undigested.steps['digest'], runIds: [] };
    const runs = {
      get: () => Promise.resolve(null),
      summary: () => ({ policy: { thresholds: { acceptAt: ACCEPT_AT } } }),
    } as unknown as RunsService;
    const records = {
      find: (id: string) =>
        Promise.resolve(id === undigested.orchestrationRunId ? undigested : null),
    } as unknown as OrchestrationRunRepository;
    const service = new MemoryService(runs, memoryPorts(), records);
    await expect(service.reindex('not-a-uuid')).rejects.toThrow(/not found/);
    await expect(service.reindex(undigested.orchestrationRunId)).rejects.toThrow(/digested no run/);
  });
});
