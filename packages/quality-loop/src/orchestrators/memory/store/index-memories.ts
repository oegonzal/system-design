/**
 * Write a source run's memories to the store as exactly these chunks. Pure of
 * the ledger, so re-indexing an already digested run — after the index
 * generation moves, or once the payload learned to carry lineage — re-embeds
 * the same engine facts rather than asking a model to derive them again, and
 * stamps every chunk with what the source run says of itself today.
 */
import type { IterationTrace, QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { outputsOf } from '../../../core/outputs';
import { skipped } from '../../common';
import type { StepResult } from '../../runner/definition';
import type { Digested } from '../digest/read-digest';
import { goalHashOf, VECTOR_NAMES, type MemoryPorts, type VectorName } from '../ports';
import { chunkKind, chunksOf, type ChunkOrigin, type OwnedKinds } from './chunks';

/** The calendar day of an ISO timestamp. */
const dayOf = (iso: string): string => iso.slice(0, 10);

/**
 * The iteration a memory is stamped with: the latest of those it cites that
 * the run holds — where the evidence it rests on ends — or the run's best
 * when it cites none the run can name (a digest whose index predates the
 * iterations, or a re-index of one).
 */
const citedIteration = (trace: RunTrace, cited: readonly number[]): IterationTrace | null =>
  trace.iterations.filter((iteration) => cited.includes(iteration.iteration)).at(-1) ??
  outputsOf(trace).best;

/**
 * Where a memory came from, as every chunk of it says: the run, its pipeline,
 * the iteration it cites (`cited`: the iterations its evidence belongs to)
 * with that iteration's own decision, and the day. Per memory, never the
 * run's best for all of them: a lesson resting on what iteration 1 found and
 * iteration 2 resolved is iteration 2's, whatever a third went on to do. The
 * iteration's decision, never the run's: a run that escalated because a later
 * revision produced nothing ends `escalate`, and that says nothing about the
 * judged iteration the digest learned from — stamped with it, the lesson would
 * read to a curator as one from a run that failed.
 *
 * Beside it, the lineage: the iteration whose judges produced the evidence —
 * the stamped one, unless it is the iteration the run adopted, in which case
 * the adopted run's — what it adopted, and the hash of the bare goal. A goal a
 * recall composed carries the remembered section too, and that is not part of
 * what the run was asked.
 */
export const originOf = (
  source: QualityRunDto,
  trace: RunTrace,
  cited: readonly number[] = [],
): ChunkOrigin => {
  const stamped = citedIteration(trace, cited);
  const iteration = stamped?.iteration ?? trace.bestIteration;
  const { adoptedFrom } = source.request;
  return {
    source: {
      runId: source.runId,
      pipeline: trace.pipeline.id,
      decision: stamped?.decision.finalDecision ?? trace.finalDecision,
      iteration,
      when: dayOf(source.startedAt),
    },
    lineage: {
      judged:
        stamped?.mode === 'adopted' && adoptedFrom !== null
          ? adoptedFrom
          : { runId: source.runId, iteration },
      adoptedFrom,
      goalHash: goalHashOf(trace.contract.goal),
    },
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
  // Each memory is stamped from the iterations it cites, so each is chunked under its own origin.
  const chunks = digested.memories.flatMap((memory) =>
    chunksOf(
      [memory],
      originOf(source, trace, memory.iterations),
      digested.digestRunId,
      model,
      ownedKinds,
    ),
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
