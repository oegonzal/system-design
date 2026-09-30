/**
 * The ports the memory orchestrator runs over. Adapters live in the memory
 * module — Qdrant for the store, MikroORM for the cache, a model for the
 * probes — and specs hand in in-memory fakes. The chunk vocabulary is the
 * memory-recall pipeline's own `ChunkSource`, so a stored chunk is a valid
 * recall candidate without conversion.
 */
import { createHash } from 'node:crypto';

import type { LlmAvailabilityDto, MemoryStoreAvailabilityDto } from '@sysdesign/contracts';

import type { EVIDENCE_KINDS } from '../../pipelines/experience-digest/input';
import type { ChunkSource } from '../../pipelines/memory-recall/input';
import type { CachedEmbeddings } from './embeddings';

/** The engine evidence a stored memory rests on — joinable to the source run's rows. */
export interface EvidenceRef {
  kind: (typeof EVIDENCE_KINDS)[number];
  ref: string;
}

/**
 * A memory is indexed twice, because a prompt and a lesson are not written in
 * the same register. `condition` carries the digest's `appliesWhen` — a
 * situation, the same shape as the problem a goal states — and `lesson`
 * carries the `insight`, the imperative half. A query compares against
 * whichever it resembles; measured on the live corpus, comparing a prompt
 * against the imperative half alone put every lesson further from the query
 * than the lessons were from each other.
 */
export const VECTOR_NAMES = ['condition', 'lesson'] as const;

export type VectorName = (typeof VECTOR_NAMES)[number];

/** How a text is identified wherever it is stored or cached: sha256 hex of the text itself. */
export const contentHash = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export interface MemoryChunk {
  /** The whole lesson, as the curator reads it and as it reaches a goal. */
  text: string;
  /** sha256 hex of `text`; a search dedupes on it. */
  contentHash: string;
  source: ChunkSource;
  evidence: EvidenceRef[];
  /** The experience-digest run that produced it. */
  digestRunId: string | null;
  model: string;
}

/** A chunk with the texts it is indexed by — one per name in the collection. */
export interface IndexedChunk extends MemoryChunk {
  keys: Record<VectorName, string>;
}

export interface StoredChunk extends IndexedChunk {
  vectors: Record<VectorName, number[]>;
}

export interface MemoryHit extends MemoryChunk {
  /** Cosine similarity against the probe that found it, higher is closer. */
  score: number;
}

/** One dense query: a vector, the named vector it is compared against, and its budget. */
export interface MemoryProbe {
  vector: readonly number[];
  using: VectorName;
  /** How many hits this probe may contribute before fusion. */
  limit: number;
}

export interface MemoryStore {
  /** Reachable and bound to a model? Derived facts, reported as data. */
  verify(): Promise<MemoryStoreAvailabilityDto>;
  /**
   * Every probe in one round trip, answered in probe order. One call so the
   * failure is all-or-nothing: a partial ranking is worse than none, because
   * nothing downstream could tell it had happened.
   */
  searchMany(probes: readonly MemoryProbe[]): Promise<MemoryHit[][]>;
  /** A source run's chunks become exactly these: stale ones go, the rest upsert. Returns how many stand. */
  replaceRunChunks(sourceRunId: string, chunks: readonly StoredChunk[]): Promise<number>;
}

export interface EmbeddingCache {
  find(model: string, hashes: readonly string[]): Promise<Map<string, number[]>>;
  save(model: string, entries: readonly { hash: string; vector: number[] }[]): Promise<void>;
}

/** Probes past this add candidates without adding coverage; the goal is extra. */
export const MAX_PROBES = 6;

/** What a recall asks for the conditions of the goal it is about to answer. */
export interface QueryProbes {
  /**
   * Conditions to search under, beyond the goal itself. Empty is a valid
   * answer and the only failure mode: a recall with no derived probes is a
   * recall over the goal alone, which is what it did before there were any.
   */
  derive(goal: string): Promise<string[]>;
}

/** Derives nothing; recall falls back to the goal. Used when no model is configured. */
export const noQueryProbes: QueryProbes = { derive: () => Promise.resolve([]) };

/** The ports the memory orchestrator runs over; the module that owns the adapters binds them. */
export interface MemoryPorts {
  embedding: LlmAvailabilityDto;
  embeddings: CachedEmbeddings;
  store: MemoryStore;
  probes: QueryProbes;
}
