/**
 * The memory orchestrator's four steps, as adapters over its ports. Each one
 * decides its own closed reason and returns what the next step needs; the
 * runner owns the ledger, the cascade and the child ids. Recall never blocks
 * the target; the target's failure is the one that ends the run.
 */
import type {
  LlmAvailabilityDto,
  MemoryContextDto,
  MemoryStepReason,
  QualityRunDto,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { outputsOf } from '../../core/outputs';
import {
  bareGoal,
  buildQuery,
  chunksOf,
  fuse,
  memoriesToStore,
  probesOf,
  probeTexts,
  queryText,
  readPack,
  withMemory,
  type FusedHit,
  type MemoryToStore,
} from '../../modules/memory/compose';
import type { CachedEmbeddings } from '../../modules/memory/embeddings';
import { VECTOR_NAMES, type MemoryStore } from '../../modules/memory/ports';
import type { QueryProbes } from '../../modules/memory/query-probes';
import { fromRun } from '../../pipelines/experience-digest/compose';
import {
  EXPERIENCE_DIGEST_ID,
  renderGoal as renderRecord,
} from '../../pipelines/experience-digest/input';
import {
  MAX_CANDIDATES,
  MEMORY_RECALL_ID,
  renderGoal as renderQuery,
} from '../../pipelines/memory-recall/input';
import type { StepContext, StepResult } from '../definition';

/** The ports the memory orchestrator runs over; the module that owns the adapters binds them. */
export interface MemoryPorts {
  embedding: LlmAvailabilityDto;
  embeddings: CachedEmbeddings;
  store: MemoryStore;
  probes: QueryProbes;
}

export interface Digested {
  digestRunId: string;
  memories: MemoryToStore[];
}

/** What each step hands on. `store` yields nothing: it is the end of the line. */
export interface MemoryOutputs {
  recall: { goal: string };
  target: QualityRunDto;
  digest: Digested;
  store: undefined;
}

type Ctx = StepContext<MemoryOutputs, MemoryPorts>;

/** A skip yields nothing, so it satisfies every step's result type. */
const skip = (
  reason: MemoryStepReason | 'pipeline-unavailable' | 'upstream-skipped',
  note: string | null = null,
): StepResult<never> => ({
  status: 'skipped',
  reason,
  note,
});

const contextOf = (ctx: Ctx): MemoryContextDto => ctx.context as unknown as MemoryContextDto;

/** Recall memory for the goal; yields the goal the target should run with, or nothing. */
export async function recall(ctx: Ctx): Promise<StepResult<{ goal: string }>> {
  const { embeddings, store, probes } = ctx.ports;
  const context = contextOf(ctx);
  const goal = ctx.request.goal;
  if (!embeddings.enabled) return skip('embeddings-disabled', context.embedding.reason);
  if (!context.store.ready) {
    return skip('store-unavailable', context.store.note ?? context.store.reason);
  }
  if (context.store.chunks === 0) return skip('store-empty');
  const acceptAt = ctx.acceptAtOf(MEMORY_RECALL_ID);
  if (acceptAt === null) return skip('pipeline-unavailable', MEMORY_RECALL_ID);

  const query = queryText(goal);
  // The goal is always probe zero; derived conditions only widen the net.
  const texts = probeTexts(goal, await probes.derive(query));
  const embedded = await embeddings.embed(texts);
  if (embedded === null) {
    return { status: 'failed', reason: 'embedding-failed', counts: { probes: texts.length } };
  }
  let hits: FusedHit[];
  try {
    hits = fuse(await store.searchMany(probesOf(embedded.vectors, MAX_CANDIDATES)), MAX_CANDIDATES);
  } catch (error) {
    return { status: 'failed', reason: 'store-unavailable', note: describeError(error).message };
  }
  if (hits.length === 0) return skip('store-empty');

  const child = await ctx.execute({ goal: renderQuery(buildQuery(query, texts, hits)) });
  if (child.status === 'failed' || child.trace === null) {
    return { status: 'failed', reason: 'run-failed', note: child.error?.message ?? null };
  }
  const readout = readPack(outputsOf(child.trace), hits, acceptAt);
  const counts = {
    probes: texts.length,
    candidates: hits.length,
    kept: readout.kept,
    usable: readout.usable.length,
    injected: 0,
  };
  if (!readout.admitted) return { status: 'complete', reason: 'not-accepted', counts };
  if (readout.usable.length === 0)
    return { status: 'complete', reason: 'no-usable-memory', counts };
  const composed = withMemory(goal, readout.usable);
  if (composed === null) return { status: 'complete', reason: 'goal-at-budget', counts };
  return {
    status: 'complete',
    counts: { ...counts, injected: composed.injected },
    output: { goal: composed.goal },
  };
}

/** Run the target pipeline with whatever recall handed on; its failure is the run's. */
export async function target(ctx: Ctx): Promise<StepResult<QualityRunDto>> {
  const child = await ctx.execute({
    goal: ctx.outputs.recall?.goal ?? ctx.request.goal,
    output: ctx.request.output,
    maxIterations: ctx.request.maxIterations,
  });
  if (child.status === 'failed' || child.trace === null) {
    return {
      status: 'failed',
      reason: 'run-failed',
      note: child.error?.message ?? null,
      error: child.error ?? {
        name: 'RunFailed',
        message: 'the target run produced no trace',
        stack: null,
      },
    };
  }
  const outputs = outputsOf(child.trace);
  return {
    status: 'complete',
    counts: {
      iterations: child.trace.iterations.length,
      overall: outputs.decision?.scores.overall ?? 0,
    },
    output: child,
  };
}

/** Digest the finished target; yields what the digest endorsed, or nothing with the reason. */
export async function digest(ctx: Ctx): Promise<StepResult<Digested>> {
  const source = ctx.outputs.target;
  if (source === undefined) return skip('upstream-skipped', 'target');
  if (!ctx.ports.embeddings.enabled) {
    return skip('embeddings-disabled', contextOf(ctx).embedding.reason);
  }
  const acceptAt = ctx.acceptAtOf(EXPERIENCE_DIGEST_ID);
  if (acceptAt === null) return skip('pipeline-unavailable', EXPERIENCE_DIGEST_ID);
  // The digest judges the bare prompt: remembered evidence is never re-digested.
  const trace = source.trace;
  const record =
    trace === null
      ? null
      : fromRun({
          ...source,
          trace: { ...trace, contract: { ...trace.contract, goal: bareGoal(trace.contract.goal) } },
        });
  if (record === null) return skip('nothing-to-digest');

  const child = await ctx.execute({ goal: renderRecord(record) });
  if (child.status === 'failed' || child.trace === null) {
    return { status: 'failed', reason: 'run-failed', note: child.error?.message ?? null };
  }
  const { admitted, proposed, memories } = memoriesToStore(outputsOf(child.trace), acceptAt);
  const counts = { memories: proposed, kept: memories.length };
  if (!admitted) return { status: 'complete', reason: 'not-accepted', counts };
  if (memories.length === 0) return { status: 'complete', reason: 'no-memories', counts };
  return { status: 'complete', counts, output: { digestRunId: child.runId, memories } };
}

/** Store what the digest endorsed as the target run's memory. */
export async function store(ctx: Ctx): Promise<StepResult<undefined>> {
  const source = ctx.outputs.target;
  const digested = ctx.outputs.digest;
  if (source === undefined) return skip('upstream-skipped', 'target');
  if (digested === undefined) return skip('upstream-skipped', 'digest');
  const context = contextOf(ctx);
  const model = ctx.ports.embeddings.model;
  if (!context.store.ready || source.trace === null || model === null) {
    return skip('store-unavailable', context.store.note ?? context.store.reason);
  }
  return indexMemories(ctx.ports, source, digested, model);
}

/**
 * Write a source run's memories to the store as exactly these chunks. Pure of
 * the ledger, so re-indexing an already digested run — after the index
 * generation moves, say — re-embeds the same engine facts rather than asking
 * a model to derive them again.
 */
export async function indexMemories(
  ports: Pick<MemoryPorts, 'embeddings' | 'store'>,
  source: QualityRunDto,
  digested: Digested,
  model: string,
): Promise<StepResult<undefined>> {
  const trace = source.trace;
  if (trace === null) return skip('nothing-to-digest');
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
  // Both indexed texts of every chunk, in one batch: the cache dedupes, and
  // the vectors come back in the order they were asked for.
  const embedded = await ports.embeddings.embed(
    chunks.flatMap((chunk) => VECTOR_NAMES.map((name) => chunk.keys[name])),
  );
  if (embedded === null) return { status: 'failed', reason: 'embedding-failed' };
  try {
    const stored = await ports.store.replaceRunChunks(
      source.runId,
      chunks.map((chunk, index) => ({
        ...chunk,
        vectors: Object.fromEntries(
          VECTOR_NAMES.map((name, offset) => [
            name,
            embedded.vectors[index * VECTOR_NAMES.length + offset],
          ]),
        ) as Record<(typeof VECTOR_NAMES)[number], number[]>,
      })),
    );
    return { status: 'complete', counts: { chunks: stored, embedded: embedded.misses } };
  } catch (error) {
    return { status: 'failed', reason: 'store-unavailable', note: describeError(error).message };
  }
}
