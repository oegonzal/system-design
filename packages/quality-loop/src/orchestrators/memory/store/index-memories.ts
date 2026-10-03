/**
 * Write a source run's memories to the store as exactly these chunks. Pure of
 * the ledger, so re-indexing an already digested run — after the index
 * generation moves, say — re-embeds the same engine facts rather than asking
 * a model to derive them again.
 */
import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { outputsOf } from '../../../core/outputs';
import { skipped } from '../../common';
import type { StepResult } from '../../runner/definition';
import type { Digested } from '../digest/read-digest';
import { VECTOR_NAMES, type MemoryPorts, type VectorName } from '../ports';
import { chunkKind, chunksOf, type ChunkOrigin, type OwnedKinds } from './chunks';

/** The calendar day of an ISO timestamp. */
const dayOf = (iso: string): string => iso.slice(0, 10);

/**
 * Where a memory came from, as every chunk of it says: the run, its pipeline,
 * the iteration it cites with that iteration's own decision, and the day. The
 * iteration's decision, never the run's: a run that escalated because a later
 * revision produced nothing ends `escalate`, and that says nothing about the
 * judged iteration the digest learned from — stamped with it, the lesson would
 * read to a curator as one from a run that failed.
 */
export const originOf = (source: QualityRunDto, trace: RunTrace): ChunkOrigin => {
  const { best, decision } = outputsOf(trace);
  return {
    runId: source.runId,
    pipeline: trace.pipeline.id,
    decision: decision?.finalDecision ?? trace.finalDecision,
    iteration: best?.iteration ?? trace.bestIteration,
    when: dayOf(source.startedAt),
  };
};

/** The named vectors of chunk `index` out of one batch that asked every name of every chunk in order. */
const vectorsFor = (
  index: number,
  vectors: readonly (readonly number[])[],
): Record<VectorName, number[]> =>
  Object.fromEntries(
    VECTOR_NAMES.map((name, offset) => [name, vectors[index * VECTOR_NAMES.length + offset]]),
  ) as Record<VectorName, number[]>;

export async function indexMemories(
  ports: Pick<MemoryPorts, 'embeddings' | 'store'>,
  source: QualityRunDto,
  digested: Digested,
  model: string,
  /**
   * Every kind this writer may ever write under a source run — what it owns,
   * not what this run happened to write. A source run's points are replaced by
   * kind, so the two bounds pull opposite ways: a scope narrower than the
   * writer's vocabulary orphans a point whose kind an earlier digest wrote and
   * this one did not, and a scope wider than it erases another writer's points
   * under the same run. Declared by the caller because the vocabulary belongs
   * to the caller's digest, which this function cannot see.
   */
  ownedKinds: OwnedKinds,
): Promise<StepResult<undefined>> {
  const trace = source.trace;
  if (trace === null) return skipped('nothing-to-digest');
  const chunks = chunksOf(
    digested.memories,
    originOf(source, trace),
    digested.digestRunId,
    model,
    ownedKinds,
  );
  // A memory whose declared kind this writer does not own is filed under the
  // default rather than dropped, and counted so the retyping is not silent.
  const retyped = digested.memories.filter(
    (memory) => memory.kind !== undefined && chunkKind(memory.kind, ownedKinds) !== memory.kind,
  ).length;
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
      { kinds: ownedKinds },
    );
    return {
      status: 'complete',
      counts: {
        chunks: stored,
        embedded: embedded.misses,
        ...(retyped > 0 ? { retyped } : {}),
      },
    };
  } catch (error) {
    return { status: 'failed', reason: 'store-unavailable', note: describeError(error).message };
  }
}
