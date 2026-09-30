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
  RunTrace,
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
  type ChunkOrigin,
  type FusedHit,
  type MemoryToStore,
} from '../../modules/memory/compose';
import type { CachedEmbeddings } from '../../modules/memory/embeddings';
import { VECTOR_NAMES, type MemoryStore } from '../../modules/memory/ports';
import type { QueryProbes } from '../../modules/memory/query-probes';
import { fromRun } from '../../pipelines/experience-digest/from-run';
import {
  EXPERIENCE_DIGEST_ID,
  renderGoal as renderRecord,
} from '../../pipelines/experience-digest/input';
import {
  MAX_CANDIDATES,
  MEMORY_RECALL_ID,
  renderGoal as renderQuery,
} from '../../pipelines/memory-recall/input';
import { completed, requestInput, runFailed, runTarget, skipped } from '../common';
import type { StepContext, StepResult } from '../runner/definition';

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

/** A skip for one of the memory orchestrator's declared reasons, or the runner's two that a step may give itself. */
const skip = (
  reason: MemoryStepReason | 'pipeline-unavailable' | 'upstream-skipped',
  note: string | null = null,
): StepResult<never> => skipped(reason, note);

const contextOf = (ctx: Ctx): MemoryContextDto => ctx.context as unknown as MemoryContextDto;

/** Why a recall cannot run at all — no embeddings, no store, nothing stored, no pipeline — or null when it can. */
function recallReadiness(ctx: Ctx): StepResult<never> | null {
  const context = contextOf(ctx);
  if (!ctx.ports.embeddings.enabled) return skip('embeddings-disabled', context.embedding.reason);
  if (!context.store.ready) {
    return skip('store-unavailable', context.store.note ?? context.store.reason);
  }
  if (context.store.chunks === 0) return skip('store-empty');
  if (ctx.acceptAtOf(MEMORY_RECALL_ID) === null) {
    return skip('pipeline-unavailable', MEMORY_RECALL_ID);
  }
  return null;
}

/** Recall memory for the goal; yields the goal the target should run with, or nothing. */
export async function recall(ctx: Ctx): Promise<StepResult<{ goal: string }>> {
  const notReady = recallReadiness(ctx);
  if (notReady !== null) return notReady;
  const { embeddings, store, probes } = ctx.ports;
  const goal = ctx.request.goal;
  const acceptAt = ctx.acceptAtOf(MEMORY_RECALL_ID) ?? 0;

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
  if (!completed(child)) return runFailed(child);
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
export const target = (ctx: Ctx): Promise<StepResult<QualityRunDto>> =>
  runTarget(ctx, requestInput(ctx.request, ctx.outputs.recall?.goal ?? ctx.request.goal));

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
  if (!completed(child)) return runFailed(child);
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

/** Where a memory came from, as every chunk of it says: the run, its pipeline, how it ended, and the day. */
const originOf = (source: QualityRunDto, trace: RunTrace): ChunkOrigin => ({
  runId: source.runId,
  pipeline: trace.pipeline.id,
  decision: trace.finalDecision,
  iteration: trace.bestIteration,
  when: dayOf(source.startedAt),
});

/** The calendar day of an ISO timestamp. */
const dayOf = (iso: string): string => iso.slice(0, 10);

/** The named vectors of chunk `index` out of one batch that asked every name of every chunk in order. */
const vectorsFor = (
  index: number,
  vectors: readonly (readonly number[])[],
): Record<(typeof VECTOR_NAMES)[number], number[]> =>
  Object.fromEntries(
    VECTOR_NAMES.map((name, offset) => [name, vectors[index * VECTOR_NAMES.length + offset]]),
  ) as Record<(typeof VECTOR_NAMES)[number], number[]>;

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
  const chunks = chunksOf(digested.memories, originOf(source, trace), digested.digestRunId, model);
  // Both indexed texts of every chunk, in one batch: the cache dedupes, and
  // the vectors come back in the order they were asked for.
  const embedded = await ports.embeddings.embed(
    chunks.flatMap((chunk) => VECTOR_NAMES.map((name) => chunk.keys[name])),
  );
  if (embedded === null) return { status: 'failed', reason: 'embedding-failed' };
  try {
    const stored = await ports.store.replaceRunChunks(
      source.runId,
      chunks.map((chunk, index) => ({ ...chunk, vectors: vectorsFor(index, embedded.vectors) })),
    );
    return { status: 'complete', counts: { chunks: stored, embedded: embedded.misses } };
  } catch (error) {
    return { status: 'failed', reason: 'store-unavailable', note: describeError(error).message };
  }
}
