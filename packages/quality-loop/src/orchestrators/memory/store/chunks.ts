/**
 * One `lesson` chunk per memory, addressed by the digest's own location id and
 * indexed by both halves the digest already separates: the condition it
 * applies under, and the instruction itself.
 */
import type { ChunkSource } from '../../../pipelines/memory-recall/input';
import type { MemoryToStore } from '../digest/read-digest';
import { contentHash, type IndexedChunk } from '../ports';

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
      source: { ...origin, kind: 'lesson', ref: `memory.${memory.position}` },
      evidence: memory.evidence,
      digestRunId,
      model,
    };
  });
}
