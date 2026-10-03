/**
 * One `lesson` chunk per memory, addressed by the digest's own location id and
 * indexed by both halves the digest already separates: the condition it
 * applies under, and the instruction itself.
 */
import {
  CHUNK_KINDS,
  type ChunkKind,
  type ChunkSource,
} from '../../../pipelines/memory-recall/input';
import type { MemoryToStore } from '../digest/read-digest';
import { contentHash, type IndexedChunk } from '../ports';

/**
 * The kind a memory is stored under when its digest declares none. Every
 * point written before any digest declared a kind is a lesson, so a digest
 * that still declares none writes exactly what it wrote before.
 */
export const DEFAULT_CHUNK_KIND: ChunkKind = 'lesson';

/**
 * The kind a memory is stored under: what its digest declared, when the store
 * knows that kind, and the default otherwise. A digest declaring a kind the
 * store's vocabulary does not hold would have every one of its points refused
 * on write; one fact filed under the wrong kind is the smaller loss. A spec
 * pins each digest's kinds inside this vocabulary so it cannot arise.
 */
export const chunkKind = (kind: string | undefined): ChunkKind =>
  kind !== undefined && (CHUNK_KINDS as readonly string[]).includes(kind)
    ? (kind as ChunkKind)
    : DEFAULT_CHUNK_KIND;

export interface ChunkOrigin {
  runId: string;
  pipeline: string;
  decision: ChunkSource['decision'];
  iteration: number;
  when: string;
}

const lessonText = (memory: MemoryToStore): string =>
  `${memory.insight} — applies when ${memory.appliesWhen}`;

export function chunksOf(
  memories: readonly MemoryToStore[],
  origin: ChunkOrigin,
  digestRunId: string | null,
  model: string,
): IndexedChunk[] {
  return memories.map((memory) => {
    const text = lessonText(memory);
    return {
      text,
      keys: { condition: memory.appliesWhen, lesson: memory.insight },
      contentHash: contentHash(text),
      // What the digest declared, or the one kind every memory had before any did.
      source: { ...origin, kind: chunkKind(memory.kind), ref: `memory.${memory.position}` },
      evidence: memory.evidence,
      digestRunId,
      model,
    };
  });
}
