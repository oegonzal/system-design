/**
 * Write a source run's memories to the store as exactly these chunks. Pure of
 * the ledger, so re-indexing an already digested run — after the index
 * generation moves, or once the payload learned to carry lineage — re-embeds
 * the same engine facts rather than asking a model to derive them again, and
 * stamps every chunk with what the source run says of itself today.
 */
import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { outputsOf } from '../../../core/outputs';
import { skipped } from '../../common';
import type { StepResult } from '../../runner/definition';
import type { Digested } from '../digest/read-digest';
import { contentHash, VECTOR_NAMES, type MemoryPorts, type VectorName } from '../ports';
import { bareGoal } from '../recall/inject';
import { chunksOf, type ChunkOrigin } from './chunks';

/** The calendar day of an ISO timestamp. */
const dayOf = (iso: string): string => iso.slice(0, 10);

/**
 * Where a memory came from, as every chunk of it says: the run, its pipeline,
 * the iteration it cites with that iteration's own decision, and the day. The
 * iteration's decision, never the run's: a run that escalated because a later
 * revision produced nothing ends `escalate`, and that says nothing about the
 * judged iteration the digest learned from — stamped with it, the lesson would
 * read to a curator as one from a run that failed.
 *
 * Beside it, the lineage: the iteration whose judges produced the evidence —
 * this run's best, unless its best is the iteration it adopted, in which case
 * the adopted run's — what it adopted, and the hash of the bare goal. A goal a
 * recall composed carries the remembered section too, and that is not part of
 * what the run was asked.
 */
export const originOf = (source: QualityRunDto, trace: RunTrace): ChunkOrigin => {
  const { best, decision } = outputsOf(trace);
  const iteration = best?.iteration ?? trace.bestIteration;
  const { adoptedFrom } = source.request;
  return {
    source: {
      runId: source.runId,
      pipeline: trace.pipeline.id,
      decision: decision?.finalDecision ?? trace.finalDecision,
      iteration,
      when: dayOf(source.startedAt),
    },
    lineage: {
      judged:
        best?.mode === 'adopted' && adoptedFrom !== null
          ? adoptedFrom
          : { runId: source.runId, iteration },
      adoptedFrom,
      goalHash: contentHash(bareGoal(trace.contract.goal)),
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
): Promise<StepResult<undefined>> {
  const trace = source.trace;
  if (trace === null) return skipped('nothing-to-digest');
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
