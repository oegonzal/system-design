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
 * The kind a memory is stored under: what its digest declared, when that is one
 * of the kinds this writer owns, and the default otherwise.
 *
 * Narrowed against the writer's own kinds and not the store's whole vocabulary,
 * which is what makes the replace scope sound rather than merely agreed. A
 * source run's points are replaced by kind, so a point written under a kind its
 * caller did not declare sits outside the scope and is orphaned by the next
 * re-digest. Checking against `CHUNK_KINDS` admitted every kind any writer owns,
 * so the invariant held only because no producer happened to emit another's —
 * and the next digest to declare kinds would have inherited a correct-looking
 * `[DEFAULT_CHUNK_KIND]` at its call site and brought the orphan back silently.
 * Narrowing here makes `written ⊆ owned` true by construction.
 *
 * The undeclared kind is retyped rather than refused, and counted so the
 * retyping is visible: the fact is sound and only its filing is wrong, and a
 * limit that discards the work it was measuring is the worse failure.
 */
export const chunkKind = (kind: string | undefined, owned: readonly ChunkKind[]): ChunkKind =>
  kind !== undefined && (owned as readonly string[]).includes(kind)
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
  /** The kinds the writer owns; a memory declaring any other is filed under the default. */
  ownedKinds: readonly ChunkKind[],
): IndexedChunk[] {
  return memories.map((memory) => {
    const text = lessonText(memory);
    return {
      text,
      keys: { condition: memory.appliesWhen, lesson: memory.insight },
      contentHash: contentHash(text),
      // What the digest declared, or the one kind every memory had before any did.
      source: {
        ...origin,
        kind: chunkKind(memory.kind, ownedKinds),
        ref: `memory.${memory.position}`,
      },
      evidence: memory.evidence,
      digestRunId,
      model,
    };
  });
}
