/**
 * The ports the memory orchestrator runs over. Adapters live in the memory
 * module — Qdrant for the store, MikroORM for the cache, a model for the
 * probes — and specs hand in in-memory fakes. The chunk vocabulary is the
 * memory-recall pipeline's own `ChunkSource`, so a stored chunk is a valid
 * recall candidate without conversion.
 */
import { createHash } from 'node:crypto';

import type { LlmAvailabilityDto, MemoryStoreAvailabilityDto } from '@sysdesign/contracts';

import type { ChunkSource } from '../../pipelines/memory-recall/input';
import type { CachedEmbeddings } from './embeddings';

/**
 * What a stored memory may rest on: a confirmed finding or a judged criterion
 * of the source run, or a section of a document that was digested. Declared
 * here, where the store's payload reads it, so a digest pipeline that cites a
 * new kind of evidence widens one list and every stored point still parses.
 */
export const EVIDENCE_KINDS = ['finding', 'criterion', 'section'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** The evidence a stored memory rests on — joinable to the source run's rows, or to a document's sections. */
export interface EvidenceRef {
  kind: EvidenceKind;
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
   * Conditions to search under, beyond the goal itself. `focus` is what is
   * wrong with the answer the goal is about, when it was judged before
   * (`focusLines`) — the conditions then reach for the lessons about those
   * defects as well as the goal's own demands. Empty is a valid answer and
   * the only failure mode: a recall with no derived probes is a recall over
   * the goal (and its focus) alone, which is what it did before there were any.
   */
  derive(goal: string, focus?: readonly string[]): Promise<string[]>;
}

/** The ports the memory orchestrator runs over; the module that owns the adapters binds them. */
export interface MemoryPorts {
  embedding: LlmAvailabilityDto;
  embeddings: CachedEmbeddings;
  store: MemoryStore;
  probes: QueryProbes;
}
