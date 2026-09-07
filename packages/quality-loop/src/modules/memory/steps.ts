/**
 * The four steps of a memory run over the module's ports. Each step writes
 * its own transitions to the ledger, decides the closed reason for anything
 * it skips or fails, and hands the next step exactly what it needs. Recall
 * never blocks the target; the target's failure ends the run.
 */
import type {
  MemoryRunDto,
  MemoryStep,
  MemoryStepDto,
  MemoryStepReason,
  QualityRunDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

import { toRunDto } from '../../core/contracts';
import { fromRun } from '../../pipelines/experience-digest/compose';
import { renderGoal as renderRecord } from '../../pipelines/experience-digest/input';
import { MAX_CANDIDATES, renderGoal as renderQuery } from '../../pipelines/memory-recall/input';
import type { RunsService } from '../runs/runs.service';
import {
  bareGoal,
  bestIteration,
  buildQuery,
  chunksOf,
  memoriesToStore,
  queryText,
  readPack,
  withMemory,
  type MemoryToStore,
} from './compose';
import type { CachedEmbeddings } from './embeddings';
import type { MemoryPipelines, MemoryStore } from './ports';

export interface StepEnv {
  runs: RunsService;
  embeddings: CachedEmbeddings;
  store: MemoryStore;
  pipelines: MemoryPipelines;
}

export interface Outcome {
  status: 'complete' | 'skipped' | 'failed';
  reason?: MemoryStepReason | null;
  note?: string | null;
  counts?: Record<string, number>;
}

/** What a run's steps become when it cannot go on: running → failed, pending → skipped, one reason. */
export function closeSteps(
  steps: Record<MemoryStep, MemoryStepDto>,
  reason: MemoryStepReason,
  note: string | null,
  at: string,
): Record<MemoryStep, MemoryStepDto> {
  return Object.fromEntries(
    Object.entries(steps).map(([step, dto]) => [
      step,
      dto.status === 'running'
        ? { ...dto, status: 'failed', reason, note, finishedAt: at }
        : dto.status === 'pending'
          ? { ...dto, status: 'skipped', reason, note: null, finishedAt: at }
          : dto,
    ]),
  ) as Record<MemoryStep, MemoryStepDto>;
}

/**
 * The record's step ledger. Every transition is flushed at once, on one
 * serial chain, so writes land in order and a failed flush is logged rather
 * than thrown: the record in memory is the truth, and `close()` writes it whole.
 */
export class StepLedger {
  private writes: Promise<void> = Promise.resolve();

  constructor(
    readonly record: MemoryRunDto,
    private readonly flush: (record: MemoryRunDto) => Promise<void>,
    private readonly now: () => string,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  begin(step: MemoryStep): Promise<void> {
    return this.set(step, { status: 'running', startedAt: this.now() });
  }

  child(step: MemoryStep, runId: string): Promise<void> {
    return this.set(step, { runId });
  }

  end(step: MemoryStep, outcome: Outcome): Promise<void> {
    return this.set(step, {
      status: outcome.status,
      reason: outcome.reason ?? null,
      note: outcome.note ?? null,
      counts: outcome.counts ?? this.record.steps[step].counts,
      finishedAt: this.now(),
    });
  }

  skip(step: MemoryStep, reason: MemoryStepReason, note: string | null = null): Promise<void> {
    return this.end(step, { status: 'skipped', reason, note });
  }

  /** Every flush so far, settled — the terminal write waits on it. */
  settled(): Promise<void> {
    return this.writes;
  }

  private set(step: MemoryStep, patch: Partial<MemoryStepDto>): Promise<void> {
    this.record.steps[step] = { ...this.record.steps[step], ...patch };
    this.writes = this.writes
      .then(() => this.flush(this.record))
      .catch((error: unknown) => this.warn(`step not flushed: ${describe(error)}`));
    return this.writes;
  }
}

const registered = (env: StepEnv, pipeline: string): boolean =>
  env.runs.list().some((summary) => summary.id === pipeline);

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Recall memory for the goal; returns the goal the target should run with. */
export async function recall(env: StepEnv, ledger: StepLedger, goal: string): Promise<string> {
  const { record } = ledger;
  if (!env.embeddings.enabled) {
    await ledger.skip('recall', 'embeddings-disabled', record.embedding.reason);
    return goal;
  }
  if (!record.store.ready) {
    await ledger.skip('recall', 'store-unavailable', record.store.note ?? record.store.reason);
    return goal;
  }
  if (record.store.chunks === 0) {
    await ledger.skip('recall', 'store-empty');
    return goal;
  }
  if (!registered(env, env.pipelines.recall)) {
    await ledger.skip('recall', 'pipeline-unavailable', env.pipelines.recall);
    return goal;
  }

  await ledger.begin('recall');
  const query = queryText(goal);
  const embedded = await env.embeddings.embed([query]);
  if (embedded === null) {
    await ledger.end('recall', { status: 'failed', reason: 'embedding-failed' });
    return goal;
  }
  let hits;
  try {
    hits = await env.store.search(embedded.vectors[0], MAX_CANDIDATES);
  } catch (error) {
    await ledger.end('recall', {
      status: 'failed',
      reason: 'store-unavailable',
      note: describe(error),
    });
    return goal;
  }
  if (hits.length === 0) {
    await ledger.end('recall', { status: 'skipped', reason: 'store-empty' });
    return goal;
  }

  const child = await env.runs.execute(
    { pipeline: env.pipelines.recall, goal: renderQuery(buildQuery(query, hits)) },
    (opened) => void ledger.child('recall', opened.runId),
  );
  if (child.status === 'failed' || child.trace === null) {
    await ledger.end('recall', {
      status: 'failed',
      reason: 'run-failed',
      note: child.error?.message,
    });
    return goal;
  }
  const readout = readPack(child.trace, hits);
  const counts = {
    candidates: hits.length,
    kept: readout.kept,
    usable: readout.usable.length,
    injected: 0,
  };
  if (child.trace.finalDecision !== 'accept') {
    await ledger.end('recall', { status: 'complete', reason: 'not-accepted', counts });
    return goal;
  }
  if (readout.usable.length === 0) {
    await ledger.end('recall', { status: 'complete', reason: 'no-usable-memory', counts });
    return goal;
  }
  const composed = withMemory(goal, readout.usable);
  if (composed === null) {
    await ledger.end('recall', { status: 'complete', reason: 'goal-at-budget', counts });
    return goal;
  }
  await ledger.end('recall', {
    status: 'complete',
    counts: { ...counts, injected: composed.injected },
  });
  return composed.goal;
}

/** Run the target pipeline; null ends the memory run as failed. */
export async function target(
  env: StepEnv,
  ledger: StepLedger,
  request: StartQualityRunRequest,
  goal: string,
): Promise<QualityRunDto | null> {
  await ledger.begin('target');
  const child = await env.runs.execute(
    {
      pipeline: request.pipeline,
      goal,
      output: request.output,
      maxIterations: request.maxIterations,
    },
    (opened) => void ledger.child('target', opened.runId),
  );
  if (child.status === 'failed' || child.trace === null) {
    await ledger.end('target', {
      status: 'failed',
      reason: 'run-failed',
      note: child.error?.message,
    });
    await ledger.skip('digest', 'target-failed');
    await ledger.skip('store', 'target-failed');
    ledger.record.error = child.error ?? {
      name: 'RunFailed',
      message: 'the target run produced no trace',
      stack: null,
    };
    return null;
  }
  const best = bestIteration(child.trace);
  await ledger.end('target', {
    status: 'complete',
    counts: {
      iterations: child.trace.iterations.length,
      overall: best?.decision.scores.overall ?? 0,
    },
  });
  return toRunDto(child);
}

export interface Digested {
  digestRunId: string;
  memories: MemoryToStore[];
}

/** Digest the finished target; null means nothing to store, with both steps explained. */
export async function digest(
  env: StepEnv,
  ledger: StepLedger,
  source: QualityRunDto,
): Promise<Digested | null> {
  const skipBoth = async (reason: MemoryStepReason, note: string | null = null) => {
    await ledger.skip('digest', reason, note);
    await ledger.skip('store', reason, note);
    return null;
  };
  if (!env.embeddings.enabled)
    return skipBoth('embeddings-disabled', ledger.record.embedding.reason);
  if (!registered(env, env.pipelines.digest))
    return skipBoth('pipeline-unavailable', env.pipelines.digest);
  // The digest judges the bare prompt: remembered evidence is never re-digested.
  const trace = source.trace;
  const record =
    trace === null
      ? null
      : fromRun({
          ...source,
          trace: { ...trace, contract: { ...trace.contract, goal: bareGoal(trace.contract.goal) } },
        });
  if (record === null) return skipBoth('nothing-to-digest');

  await ledger.begin('digest');
  const child = await env.runs.execute(
    { pipeline: env.pipelines.digest, goal: renderRecord(record) },
    (opened) => void ledger.child('digest', opened.runId),
  );
  if (child.status === 'failed' || child.trace === null) {
    await ledger.end('digest', {
      status: 'failed',
      reason: 'run-failed',
      note: child.error?.message,
    });
    await ledger.skip('store', 'digest-failed');
    return null;
  }
  const { proposed, memories } = memoriesToStore(child.trace);
  const counts = { memories: proposed, kept: memories.length };
  if (child.trace.finalDecision !== 'accept') {
    await ledger.end('digest', { status: 'complete', reason: 'not-accepted', counts });
    await ledger.skip('store', 'not-accepted');
    return null;
  }
  if (memories.length === 0) {
    await ledger.end('digest', { status: 'complete', reason: 'no-memories', counts });
    await ledger.skip('store', 'no-memories');
    return null;
  }
  await ledger.end('digest', { status: 'complete', counts });
  return { digestRunId: child.runId, memories };
}

/** Store what the digest endorsed as this source run's memory. */
export async function store(
  env: StepEnv,
  ledger: StepLedger,
  source: QualityRunDto,
  digested: Digested,
): Promise<void> {
  const trace = source.trace;
  const model = env.embeddings.model;
  if (!ledger.record.store.ready || trace === null || model === null) {
    await ledger.skip(
      'store',
      'store-unavailable',
      ledger.record.store.note ?? ledger.record.store.reason,
    );
    return;
  }
  await ledger.begin('store');
  const chunks = chunksOf(
    digested.memories,
    {
      runId: source.runId,
      pipeline: trace.pipeline.id,
      decision: trace.finalDecision,
      iteration: trace.bestIteration,
      when: source.startedAt.slice(0, 10),
    },
    digested.digestRunId,
    model,
  );
  const embedded = await env.embeddings.embed(chunks.map((chunk) => chunk.text));
  if (embedded === null) {
    await ledger.end('store', { status: 'failed', reason: 'embedding-failed' });
    return;
  }
  try {
    const stored = await env.store.replaceRunChunks(
      source.runId,
      chunks.map((chunk, index) => ({ ...chunk, vector: embedded.vectors[index] })),
    );
    await ledger.end('store', {
      status: 'complete',
      counts: { chunks: stored, embedded: embedded.misses },
    });
  } catch (error) {
    await ledger.end('store', {
      status: 'failed',
      reason: 'store-unavailable',
      note: describe(error),
    });
  }
}
