/**
 * One `lesson` chunk per memory, addressed by the digest's own location id and
 * indexed by both halves the digest already separates: the condition it
 * applies under, and the instruction itself.
 */
import { lessonText, type MemoryLineageDto } from '@sysdesign/contracts';

import type { ChunkKind, ChunkSource } from '../../../pipelines/memory-recall/input';
import type { MemoryToStore } from '../digest/read-digest';
import { contentHash, type IndexedChunk } from '../ports';

/**
 * The kind every memory had before any digest declared one. A writer whose
 * points predate kinds lists this first, so what it wrote before is what it
 * writes now; a writer with a vocabulary of its own lists its own first.
 */
export const DEFAULT_CHUNK_KIND: ChunkKind = 'lesson';

/**
 * The kinds one writer owns under a source run, the first being where it files
 * a memory whose declared kind it does not own. Non-empty by type: a writer
 * owning nothing has nowhere to file anything.
 */
export type OwnedKinds = readonly [ChunkKind, ...ChunkKind[]];

/**
 * The kind a memory is stored under: what its digest declared, when that is one
 * of the kinds this writer owns, and the writer's first kind otherwise.
 *
 * Both halves are scoped to the writer, and both had to be. A source run's
 * points are replaced by kind, so a point written under a kind its writer does
 * not own sits outside the replace scope and is orphaned by the next re-digest.
 * Checking against `CHUNK_KINDS` admitted every kind any writer owns; falling
 * back to a fixed `lesson` put the stray outside the scope of any writer that
 * does not own lessons. Each held only by the agreement of three call sites.
 *
 * Requiring every writer to own `lesson` would close the second and open the
 * worse one: owning a kind means replacing it, and the knowledge writer owns its
 * items and findings and deliberately no lesson, so under that rule it would
 * delete the memory orchestrator's lessons under the same source run. Falling
 * back to `owned[0]` instead makes the target owned by definition, which is why
 * `OwnedKinds` is non-empty by type. `written ⊆ owned` now holds for any writer.
 *
 * So ORDER IS LOAD-BEARING: the first kind a writer declares is where an
 * undeclared kind is filed. The stray is retyped rather than refused, and
 * counted so it is visible — the fact is sound and only its filing is wrong, and
 * a limit that discards the work it was measuring is the worse failure.
 */
export const chunkKind = (kind: string | undefined, owned: OwnedKinds): ChunkKind =>
  kind !== undefined && (owned as readonly string[]).includes(kind)
    ? (kind as ChunkKind)
    : owned[0];

/**
 * What every chunk of one run says about where it came from: the source the
 * curator is shown — the run, its pipeline, the cited iteration with its own
 * decision, and the day — and the lineage only a recall's screen reads. Kept
 * apart so the curator-facing shape is exactly `ChunkSource` and the lineage
 * never reaches a prompt.
 */
export interface ChunkOrigin {
  source: Omit<ChunkSource, 'kind' | 'ref'>;
  lineage: MemoryLineageDto;
}

export function chunksOf(
  memories: readonly MemoryToStore[],
  origin: ChunkOrigin,
  digestRunId: string | null,
  model: string,
  /** The kinds the writer owns; a memory declaring any other is filed under the first of them. */
  ownedKinds: OwnedKinds,
): IndexedChunk[] {
  return memories.map((memory) => {
    const text = lessonText(memory);
    return {
      text,
      keys: { condition: memory.appliesWhen, lesson: memory.insight },
      contentHash: contentHash(text),
      // What the digest declared, or the first kind this writer owns.
      source: {
        ...origin.source,
        kind: chunkKind(memory.kind, ownedKinds),
        ref: `memory.${memory.position}`,
      },
      evidence: memory.evidence,
      digestRunId,
      lineage: origin.lineage,
      model,
    };
  });
}
