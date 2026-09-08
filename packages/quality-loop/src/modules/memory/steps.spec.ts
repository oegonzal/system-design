import type { MemoryRunDto, QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { RunRecord } from '../../core/contracts';
import { fromRun } from '../../pipelines/experience-digest/compose';
import { renderGoal as renderRecord } from '../../pipelines/experience-digest/input';
import { sampleDigest } from '../../pipelines/experience-digest/testing';
import { renderGoal as renderQuery } from '../../pipelines/memory-recall/input';
import { samplePack } from '../../pipelines/memory-recall/testing';
import type { RunsService } from '../runs/runs.service';
import { bareGoal, buildQuery, MEMORY_HEADING } from './compose';
import { noQueryProbes } from './query-probes';
import { digest, recall, store, target } from './steps';
import {
  ACCEPT_AT,
  childRun as child,
  ledgerOf,
  memoryRecord as record,
  mutedEmbeddings,
  sampleHits as hits,
  stepEnv as env,
} from './steps.testing';
import { confirmed, fused, GOAL, InMemoryMemoryStore, passed, traceOf } from './testing';

const recallTrace = (decision: RunTrace['finalDecision'] = 'accept', faulted = false) =>
  traceOf({
    pipeline: 'memory-recall',
    goal: renderQuery(buildQuery(GOAL, [GOAL], fused(hits))),
    artifact: samplePack({ kept: samplePack().kept, dropped: [] }),
    locations: ['summary', 'm1', 'm2', 'gap.1'],
    criteria: [{ id: 'c1', kind: 'need', statement: 'x' }],
    results: [passed('c1', 'need', ['m1'])],
    findings: faulted
      ? [confirmed('irrelevant_chunk', ['m1']), confirmed('irrelevant_chunk', ['m2'])]
      : [],
    decision,
  });

const targetTrace = (decision: RunTrace['finalDecision'] = 'accept') =>
  traceOf({
    pipeline: 'system-design',
    goal: GOAL,
    artifact: { summary: 'a design' },
    locations: ['summary'],
    criteria: [{ id: 'c1', kind: 'functional', statement: 'x' }],
    results: [passed('c1', 'functional', ['summary'])],
    decision,
  });

/** The digest child's trace: its goal is the record the module composes, index included. */
const digestTraceFor = (source: QualityRunDto, decision: RunTrace['finalDecision'] = 'accept') => {
  const trace = source.trace;
  if (trace === null) throw new Error('a source with a trace');
  const record = fromRun({
    ...source,
    trace: { ...trace, contract: { ...trace.contract, goal: bareGoal(trace.contract.goal) } },
  });
  if (record === null) throw new Error('the source must compose');
  return traceOf({
    pipeline: 'experience-digest',
    goal: renderRecord(record),
    artifact: sampleDigest({
      memories: [{ ...sampleDigest().memories[0], evidence: ['r1'] }],
      unused: [],
    }),
    locations: ['summary', 'memory.1', 'r1'],
    criteria: [{ id: 'c1', kind: 'signal', statement: 'x' }],
    results: [passed('c1', 'signal', ['memory.1'])],
    decision,
  });
};

describe('the memory steps', () => {
  it('[QL-16] recall hands the target the goal with memory only when the pack was accepted with usable chunks', async () => {
    const accepted = env({ 'memory-recall': child('memory-recall', recallTrace()) });
    let dto = record();
    const goal = await recall(accepted, ledgerOf(dto), GOAL);
    expect(goal).toContain(MEMORY_HEADING);
    expect(dto.steps.recall).toMatchObject({
      status: 'complete',
      reason: null,
      runId: 'memory-recall-run',
      counts: { candidates: 2, kept: 2, usable: 2, injected: 2 },
    });
    expect(accepted.executed[0].goal).toContain('### [m1] lesson');

    dto = record();
    expect(
      await recall(
        env({ 'memory-recall': child('memory-recall', recallTrace('revise')) }),
        ledgerOf(dto),
        GOAL,
      ),
    ).toBe(GOAL);
    expect(dto.steps.recall).toMatchObject({
      status: 'complete',
      reason: 'not-accepted',
      counts: { usable: 0 },
    });

    dto = record();
    expect(
      await recall(
        env({ 'memory-recall': child('memory-recall', recallTrace('accept', true)) }),
        ledgerOf(dto),
        GOAL,
      ),
    ).toBe(GOAL);
    expect(dto.steps.recall).toMatchObject({ status: 'complete', reason: 'no-usable-memory' });

    dto = record();
    const wide = 'x'.repeat(64_000);
    expect(
      await recall(
        env({ 'memory-recall': child('memory-recall', recallTrace()) }),
        ledgerOf(dto),
        wide,
      ),
    ).toBe(wide);
    expect(dto.steps.recall).toMatchObject({ status: 'complete', reason: 'goal-at-budget' });
  });

  it('[QL-16] recall skips or fails with a closed reason for every way the world can be missing, and never blocks the target', async () => {
    let dto = record();
    const failed = env({ 'memory-recall': child('memory-recall', null, true) });
    expect(await recall(failed, ledgerOf(dto), GOAL)).toBe(GOAL);
    expect(dto.steps.recall).toMatchObject({
      status: 'failed',
      reason: 'run-failed',
      note: 'the model went away',
    });

    dto = record();
    const dark = env({});
    (dark.store as InMemoryMemoryStore).unreachable = true;
    expect(await recall(dark, ledgerOf(dto), GOAL)).toBe(GOAL);
    expect(dto.steps.recall).toMatchObject({
      status: 'failed',
      reason: 'store-unavailable',
      note: 'store unreachable',
    });

    dto = record();
    const mute = env(
      {},
      {
        embeddings: mutedEmbeddings(),
      },
    );
    expect(await recall(mute, ledgerOf(dto), GOAL)).toBe(GOAL);
    expect(dto.steps.recall).toMatchObject({ status: 'failed', reason: 'embedding-failed' });

    dto = record();
    const noRole = env({}, { pipelines: { recall: 'nope', digest: 'experience-digest' } });
    expect(await recall(noRole, ledgerOf(dto), GOAL)).toBe(GOAL);
    expect(dto.steps.recall).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'nope',
    });

    dto = record({ store: { ...record().store, chunks: 0 } });
    expect(await recall(env({}), ledgerOf(dto), GOAL)).toBe(GOAL);
    expect(dto.steps.recall).toMatchObject({ status: 'skipped', reason: 'store-empty' });
  });

  it('[QL-16] a failed target ends the run: digest and store skipped target-failed, the error kept', async () => {
    const dto = record();
    const ledger = ledgerOf(dto);
    const result = await target(
      env({ 'system-design': child('system-design', null, true) }),
      ledger,
      { pipeline: 'system-design', goal: GOAL },
      GOAL,
    );
    expect(result).toBeNull();
    expect(dto.steps.target).toMatchObject({
      status: 'failed',
      reason: 'run-failed',
      runId: 'system-design-run',
    });
    expect(dto.steps.digest).toMatchObject({ status: 'skipped', reason: 'target-failed' });
    expect(dto.steps.store).toMatchObject({ status: 'skipped', reason: 'target-failed' });
    expect(dto.error?.message).toBe('the model went away');

    const ok = await target(
      env({ 'system-design': child('system-design', targetTrace()) }),
      ledgerOf(record()),
      { pipeline: 'system-design', goal: GOAL, maxIterations: 2 },
      `${GOAL}\n\n${MEMORY_HEADING}\n`,
    );
    expect(ok?.trace?.finalDecision).toBe('accept');
  });

  it('[QL-16] digest judges the bare prompt and endorses nothing short of accept; store explains why it did not write', async () => {
    const targetRun = {
      ...child('system-design', targetTrace()),
      request: {
        goal: `${GOAL}\n\n${MEMORY_HEADING}\n\n- [m1] x`,
        outputProvided: false,
        maxIterations: 1,
      },
    };
    const source: QualityRunDto = {
      ...targetRun,
      exchanges: [],
      trace: {
        ...targetTrace(),
        contract: { goal: targetRun.request.goal, criteria: targetTrace().contract.criteria },
      },
    };

    let dto = record();
    const accepted = env({
      'experience-digest': () => child('experience-digest', digestTraceFor(source)),
    });
    const digested = await digest(accepted, ledgerOf(dto), source);
    expect(accepted.executed[0].goal).not.toContain(MEMORY_HEADING);
    expect(accepted.executed[0].goal).toContain(GOAL);
    expect(dto.steps.digest).toMatchObject({
      status: 'complete',
      reason: null,
      counts: { memories: 1, kept: 1 },
    });
    expect(digested?.memories).toHaveLength(1);

    dto = record();
    expect(
      await digest(
        env({ 'experience-digest': child('experience-digest', digestTraceFor(source, 'revise')) }),
        ledgerOf(dto),
        source,
      ),
    ).toBeNull();
    expect(dto.steps.digest).toMatchObject({ status: 'complete', reason: 'not-accepted' });
    expect(dto.steps.store).toMatchObject({ status: 'skipped', reason: 'not-accepted' });

    dto = record();
    expect(
      await digest(
        env({ 'experience-digest': child('experience-digest', null, true) }),
        ledgerOf(dto),
        source,
      ),
    ).toBeNull();
    expect(dto.steps.digest).toMatchObject({ status: 'failed', reason: 'run-failed' });
    expect(dto.steps.store).toMatchObject({ status: 'skipped', reason: 'digest-failed' });

    dto = record();
    expect(await digest(env({}), ledgerOf(dto), { ...source, trace: null })).toBeNull();
    expect(dto.steps.digest).toMatchObject({ status: 'skipped', reason: 'nothing-to-digest' });
    expect(dto.steps.store).toMatchObject({ status: 'skipped', reason: 'nothing-to-digest' });

    dto = record({
      store: { ...record().store, ready: false, reason: 'unreachable', note: 'down' },
    });
    await store(env({}), ledgerOf(dto), source, {
      digestRunId: 'd',
      memories: digested?.memories ?? [],
    });
    expect(dto.steps.store).toMatchObject({
      status: 'skipped',
      reason: 'store-unavailable',
      note: 'down',
    });

    dto = record();
    const mute = env(
      {},
      {
        embeddings: mutedEmbeddings(),
      },
    );
    await store(mute, ledgerOf(dto), source, {
      digestRunId: 'd',
      memories: digested?.memories ?? [],
    });
    expect(dto.steps.store).toMatchObject({ status: 'failed', reason: 'embedding-failed' });

    dto = record();
    const written = env({});
    await store(written, ledgerOf(dto), source, {
      digestRunId: 'd',
      memories: digested?.memories ?? [],
    });
    // One lesson, two vectors: `embedded` counts texts the provider was asked
    // for, and a chunk is indexed by its condition and by its instruction.
    expect(dto.steps.store).toMatchObject({
      status: 'complete',
      counts: { chunks: 1, embedded: 2 },
    });
    const stored = [...(written.store as InMemoryMemoryStore).points.values()].find(
      (chunk) => chunk.source.runId === source.runId,
    );
    expect(stored?.source).toMatchObject({
      kind: 'lesson',
      ref: 'memory.1',
      pipeline: 'system-design',
      decision: 'accept',
      iteration: 1,
    });
    expect(stored?.digestRunId).toBe('d');
  });
});
