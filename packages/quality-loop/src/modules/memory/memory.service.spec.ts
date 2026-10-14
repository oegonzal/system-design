import { Logger } from '@nestjs/common';
import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import { describe, expect, it, vi } from 'vitest';

import { toRunDto } from '../../core/contracts';
import { contentHash, type MemoryPorts } from '../../orchestrators/memory/ports';
import { childRun, memoryPorts, sampleHits } from '../../orchestrators/memory/steps.testing';
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
    openedBy: null,
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

/** The service over these ports alone: a retraction reads no run and no orchestration record. */
const serviceOver = (ports: MemoryPorts): MemoryService => {
  const runs = { get: () => Promise.resolve(null) } as unknown as RunsService;
  const records = { find: () => Promise.resolve(null) } as unknown as OrchestrationRunRepository;
  return new MemoryService(runs, ports, records);
};

describe('the memory service’s re-index', () => {
  it('[QL-60] re-embeds the digest a memory run already produced, and the chunks it writes carry the source run’s lineage', async () => {
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

describe('the memory service’s retractions', () => {
  it('[QL-70] retracts every point a digest run stored and nothing else; a run the store never held removes nothing', async () => {
    const ports = memoryPorts();
    const store = ports.store as InMemoryMemoryStore;
    const seeded = store.points.size;
    expect(seeded).toBeGreaterThan(0);
    await store.replaceRunChunks('run-b', [
      {
        text: 'a lesson of another run',
        keys: { condition: 'elsewhere', lesson: 'a lesson of another run' },
        contentHash: contentHash('a lesson of another run'),
        source: {
          runId: 'run-b',
          pipeline: 'system-design',
          kind: 'lesson',
          ref: 'memory.1',
          decision: 'accept',
          iteration: 1,
          when: '2026-09-06',
        },
        evidence: [],
        digestRunId: null,
        lineage: null,
        model: 'fake-embedding',
        vectors: { condition: [0, 1, 0, 0, 0, 0, 0, 0], lesson: [0, 1, 0, 0, 0, 0, 0, 0] },
      },
    ]);
    const service = serviceOver(ports);

    expect(await service.retract('run-a')).toEqual({ runId: 'run-a', removed: seeded });
    expect([...store.points.values()].map((chunk) => chunk.source.runId)).toEqual(['run-b']);
    expect(await service.retract('run-a')).toEqual({ runId: 'run-a', removed: 0 });
  });
  it('[QL-70] retracts one memory by its run and ref and answers what it held; the run’s other memories and another run’s same ref stand, and a point never held removes nothing', async () => {
    const ports = memoryPorts();
    const store = ports.store as InMemoryMemoryStore;
    const text = 'Alex Example works on the orders team at Acme.';
    await store.replaceRunChunks('run-b', [
      {
        text,
        keys: { condition: 'a form asks whether the subject works at Acme', lesson: text },
        contentHash: contentHash(text),
        source: {
          runId: 'run-b',
          pipeline: 'document-digest',
          kind: 'profile_fact',
          ref: 'memory.1',
          decision: 'accept',
          iteration: 1,
          when: '2026-10-12',
        },
        evidence: [{ kind: 'section', ref: 'section.1' }],
        digestRunId: 'run-b',
        lineage: null,
        model: 'fake-embedding',
        vectors: { condition: [0, 0, 1, 0, 0, 0, 0, 0], lesson: [0, 0, 1, 0, 0, 0, 0, 0] },
        scope: 'unit',
      },
    ]);
    const service = serviceOver(ports);
    const standing = () =>
      [...store.points.values()].map(({ source }) => `${source.runId} ${source.ref}`);
    expect(standing()).toEqual(['run-a memory.1', 'run-a memory.2', 'run-b memory.1']);

    // The same ref under another run is another point: run-a's memory.1 stands.
    expect(await service.retractPoint('run-b', 'memory.1')).toEqual({
      runId: 'run-b',
      ref: 'memory.1',
      removed: { text, kind: 'profile_fact', scope: 'unit' },
    });
    // A memory stored without a scope answers null for it, and its run's other memory stands.
    expect(await service.retractPoint('run-a', 'memory.2')).toEqual({
      runId: 'run-a',
      ref: 'memory.2',
      removed: { text: sampleHits[1].text, kind: 'lesson', scope: null },
    });
    expect(standing()).toEqual(['run-a memory.1']);

    // Retracted already, or never stored: nothing removed, and no error.
    expect(await service.retractPoint('run-a', 'memory.2')).toEqual({
      runId: 'run-a',
      ref: 'memory.2',
      removed: null,
    });
    expect(await service.retractPoint('run-c', 'memory.1')).toEqual({
      runId: 'run-c',
      ref: 'memory.1',
      removed: null,
    });
    expect(standing()).toEqual(['run-a memory.1']);

    // A store it cannot reach is a failure, never an answer that nothing was held.
    store.unreachable = true;
    await expect(service.retractPoint('run-a', 'memory.1')).rejects.toThrow(/unreachable/);
  });
  it('[QL-70] a point held but unreadable by this build answers null as a point never held does, and the log tells the two apart', async () => {
    const ports = memoryPorts();
    const store = ports.store as InMemoryMemoryStore;
    // What the adapter answers for a payload this build would not write; the fake only holds chunks it wrote.
    vi.spyOn(store, 'retractPoint').mockResolvedValueOnce({ status: 'unreadable' });
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const logged = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = serviceOver(ports);

    const unreadable = await service.retractPoint('run-a', 'memory.1');
    const missing = await service.retractPoint('run-c', 'memory.1');
    const warnings = warned.mock.calls.map(([message]) => message);
    const lines = logged.mock.calls.map(([message]) => message);
    warned.mockRestore();
    logged.mockRestore();

    expect(unreadable).toEqual({ runId: 'run-a', ref: 'memory.1', removed: null });
    expect(missing).toEqual({ runId: 'run-c', ref: 'memory.1', removed: null });
    expect(warnings).toEqual([
      'memory memory.1 of run run-a held but unreadable by this build: nothing removed',
    ]);
    expect(lines).toEqual(['memory memory.1 of run run-c not held: nothing removed']);
  });
});
