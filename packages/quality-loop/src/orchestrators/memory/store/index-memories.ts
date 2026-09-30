/**
 * Write a source run's memories to the store as exactly these chunks. Pure of
 * the ledger, so re-indexing an already digested run — after the index
 * generation moves, say — re-embeds the same engine facts rather than asking
 * a model to derive them again.
 */
import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { skipped } from '../../common';
import type { StepResult } from '../../runner/definition';
import type { Digested } from '../digest/read-digest';
import { VECTOR_NAMES, type MemoryPorts, type VectorName } from '../ports';
import { chunksOf, type ChunkOrigin } from './chunks';

/** The calendar day of an ISO timestamp. */
const dayOf = (iso: string): string => iso.slice(0, 10);

/** Where a memory came from, as every chunk of it says: the run, its pipeline, how it ended, and the day. */
const originOf = (source: QualityRunDto, trace: RunTrace): ChunkOrigin => ({
  runId: source.runId,
  pipeline: trace.pipeline.id,
  decision: trace.finalDecision,
  iteration: trace.bestIteration,
  when: dayOf(source.startedAt),
});

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
