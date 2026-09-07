/**
 * The ports the memory module runs over. Adapters: Qdrant for the store,
 * MikroORM for the cache and the run record; specs hand in in-memory fakes.
 * The chunk vocabulary is the memory-recall pipeline's own `ChunkSource`, so
 * a stored chunk is a valid recall candidate without conversion.
 */
import type { MemoryRunDto, MemoryStoreAvailabilityDto } from '@sysdesign/contracts';

import type { RunListQuery } from '../../core/ports';
import type { ChunkSource } from '../../pipelines/memory-recall/input';

/** The engine evidence a stored memory rests on — joinable to the source run's rows. */
export interface EvidenceRef {
  kind: 'finding' | 'criterion';
  ref: string;
}

export interface MemoryChunk {
  text: string;
  /** sha256 hex of `text`; a search dedupes on it. */
  contentHash: string;
  source: ChunkSource;
  evidence: EvidenceRef[];
  /** The experience-digest run that produced it. */
  digestRunId: string | null;
  model: string;
}

export interface StoredChunk extends MemoryChunk {
  vector: number[];
}

export interface MemoryHit extends MemoryChunk {
  /** Cosine similarity, higher is closer. */
  score: number;
}

export interface MemoryStore {
  /** Reachable and bound to a model? Derived facts, reported as data. */
  verify(): Promise<MemoryStoreAvailabilityDto>;
  search(vector: readonly number[], limit: number): Promise<MemoryHit[]>;
  /** A source run's chunks become exactly these: stale ones go, the rest upsert. Returns how many stand. */
  replaceRunChunks(sourceRunId: string, chunks: readonly StoredChunk[]): Promise<number>;
}

export interface EmbeddingCache {
  find(model: string, hashes: readonly string[]): Promise<Map<string, number[]>>;
  save(model: string, entries: readonly { hash: string; vector: number[] }[]): Promise<void>;
}

/** Where memory runs live between requests and across restarts. */
export interface MemoryRunRepository {
  open(record: MemoryRunDto): Promise<void>;
  /** Steps and child ids, flushed at every transition; a swept row is never resurrected. */
  update(record: MemoryRunDto): Promise<void>;
  close(record: MemoryRunDto): Promise<void>;
  find(memoryRunId: string): Promise<MemoryRunDto | null>;
  list(query: RunListQuery): Promise<[MemoryRunDto[], number]>;
  /** Rows still `running` from a previous process are failed; returns how many. */
  failInterrupted(): Promise<number>;
}

/** Which registered pipelines play the two memory roles. */
export interface MemoryPipelines {
  recall: string;
  digest: string;
}
