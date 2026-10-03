/**
 * One `lesson` chunk per memory, addressed by the digest's own location id and
 * indexed by both halves the digest already separates: the condition it
 * applies under, and the instruction itself.
 */
import { lessonText, type MemoryLineageDto } from '@sysdesign/contracts';

import type { ChunkSource } from '../../../pipelines/memory-recall/input';
import type { MemoryToStore } from '../digest/read-digest';
import { contentHash, type IndexedChunk } from '../ports';

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
): IndexedChunk[] {
  return memories.map((memory) => {
    const text = lessonText(memory);
    return {
      text,
      keys: { condition: memory.appliesWhen, lesson: memory.insight },
      contentHash: contentHash(text),
      source: { ...origin.source, kind: 'lesson', ref: `memory.${memory.position}` },
      evidence: memory.evidence,
      digestRunId,
      lineage: origin.lineage,
      model,
    };
  });
}
