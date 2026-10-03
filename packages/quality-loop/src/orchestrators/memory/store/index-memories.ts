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
import { chunksOf, type ChunkOrigin, DEFAULT_CHUNK_KIND } from './chunks';

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
      // This writer owns the kinds it writes under a source run, and nothing
      // else: another writer keeps its own kinds under the same run id, and an
      // unscoped replace would erase them. The scope is read from the chunks
      // rather than fixed, because a digest that declares kinds of its own
      // would otherwise re-post under a kind the scope does not name and leave
      // its previous points standing beside the new ones. `lesson` is always
      // included: it is what this writer wrote before any kind was declared,
      // so a re-run still replaces what an earlier one left.
      { kinds: [...new Set([DEFAULT_CHUNK_KIND, ...chunks.map((chunk) => chunk.source.kind)])] },
    );
    return { status: 'complete', counts: { chunks: stored, embedded: embedded.misses } };
  } catch (error) {
    return { status: 'failed', reason: 'store-unavailable', note: describeError(error).message };
  }
}
