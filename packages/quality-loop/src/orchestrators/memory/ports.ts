/**
 * The ports the memory orchestrator runs over. Adapters live in the memory
 * module — Qdrant for the store, MikroORM for the cache, a model for the
 * probes — and specs hand in in-memory fakes. The chunk vocabulary is the
 * memory-recall pipeline's own `ChunkSource`, so a stored chunk is a valid
 * recall candidate without conversion.
 */
import { createHash } from 'node:crypto';

import type {
  ChunkFacetsDto,
  LlmAvailabilityDto,
  MemoryLineageDto,
  MemoryScope,
  MemoryStoreAvailabilityDto,
} from '@sysdesign/contracts';

import type { ChunkKind, ChunkSource } from '../../pipelines/memory-recall/input';

export type { ChunkKind };
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

/**
 * A stored point, named the way the store addresses it: the run it was
 * digested from and the item within that run. The adapter turns the pair into
 * one id, so nothing outside it needs to know how.
 */
export interface PointRef {
  runId: string;
  ref: string;
}

/**
 * What a chunk carries beyond its text and provenance: what a search may
 * filter on and what a curator's rule may read. Every field is optional and
 * the wire shape is the contract's, so a chunk stored before any of them
 * existed still parses and still ranks.
 */
export type ChunkFacets = ChunkFacetsDto;

export interface MemoryChunk {
  /** The whole lesson, as the curator reads it and as it reaches a goal. */
  text: string;
  /** sha256 hex of `text`; a search dedupes on it. */
  contentHash: string;
  source: ChunkSource;
  evidence: EvidenceRef[];
  /** The experience-digest run that produced it. */
  digestRunId: string | null;
  /**
   * Where the cited evidence was judged — the iteration the lesson rests on,
   * what the source run adopted, and the hash of its bare goal — so a recall
   * can screen out a copy of what its asker already holds. Written on every
   * chunk; null only on a point stored before lineage was recorded, which a
   * re-index of its memory run back-fills.
   */
  lineage: MemoryLineageDto | null;
  model: string;
  /** Absent on a chunk written before facets, and on one whose writer derives none. */
  facets?: ChunkFacets;
  /**
   * Where a document memory holds — of the subject wherever asked, or of the one
   * unit of work it was recorded for. Absent on a chunk written before scopes
   * and on one whose digest declares none; a reader takes the contracts' default.
   */
  scope?: MemoryScope;
  /**
   * The unit of work a memory bound to one (`isUnitBound`) was recorded for,
   * as its composer names it (`unitKeyOf`) — what a search names to read it.
   * Absent on every other memory, and on a bound one recorded before units
   * were named, which no search reads.
   */
  unitKey?: string;
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

/**
 * What a probe will consider, declared rather than passed through: an
 * adapter's own filter language would leak into every caller and every fake.
 * Each field narrows, and an absent one does not — except where a memory is
 * bound to a unit of work: such a memory is read only by a search naming its
 * unit, so `{}` and `undefined` search every memory bound to none. Measured
 * 2026-10-14 over 15 questions about the organisation a unit of work was for:
 * answers given in other units held 29 of their 45 evidence slots, and with
 * them left out the sentence settling the question was among its evidence
 * for 14, against 12.
 */
export interface ProbeFilter {
  /** Only these chunk kinds — a search for knowledge need not read episodic precedent. */
  kinds?: readonly ChunkKind[];
  /** Only chunks digested by these pipelines — the facet that most predicts a usable hit. */
  pipelines?: readonly string[];
  /** Never these source runs — a run asking what is known must not be told its own items. */
  notRunIds?: readonly string[];
  /** The unit of work the search is for (`unitKeyOf`): of the memories bound to one, only its. Absent, none of them. */
  unitKey?: string;
}

/** The chunk kinds one writer owns under a source run: what a replace of its own points may delete. */
export interface ChunkKindScope {
  kinds: readonly ChunkKind[];
}

/** One dense query: a vector, the named vector it is compared against, its budget, and what it will consider. */
export interface MemoryProbe {
  vector: readonly number[];
  using: VectorName;
  /** How many hits this probe may contribute before fusion. */
  limit: number;
  filter?: ProbeFilter;
}

/**
 * What a point retraction met at its address. A point whose payload this
 * build cannot read is none of its memories — a search passes it by — so it
 * is left standing, and answered as held rather than as a point the store
 * never had.
 */
export type PointRetraction =
  { status: 'removed'; memory: MemoryChunk } | { status: 'unreadable' } | { status: 'not-held' };

export interface MemoryStore {
  /** Reachable and bound to a model? Derived facts, reported as data. */
  verify(): Promise<MemoryStoreAvailabilityDto>;
  /**
   * Every probe in one round trip, answered in probe order. One call so the
   * failure is all-or-nothing: a partial ranking is worse than none, because
   * nothing downstream could tell it had happened.
   */
  searchMany(probes: readonly MemoryProbe[]): Promise<MemoryHit[][]>;
  /**
   * A source run's chunks become exactly these: stale ones go, the rest
   * upsert. Returns how many stand.
   *
   * `scope` is what the caller owns. Two writers now keep points under one
   * source run — the memory orchestrator its lessons, the knowledge
   * orchestrator its items and findings — and an unscoped replace would have
   * each erase the other. Every writer names its kinds; an absent scope still
   * replaces the run's every point, which is what a reader of the older
   * behaviour expects.
   */
  replaceRunChunks(
    sourceRunId: string,
    chunks: readonly StoredChunk[],
    scope?: ChunkKindScope,
  ): Promise<number>;
  /**
   * Set the support counts of points that already stand, leaving everything
   * else about them alone. The counts are derived from rows elsewhere and
   * written here only so a search can read them; a point that has since gone
   * is skipped, never recreated.
   */
  setSupport(
    updates: readonly { point: PointRef; support: { confirms: number; contradicts: number } }[],
  ): Promise<void>;
  /**
   * Every point a source run stored, gone — whatever its kind: a digest run
   * has one writer, so the run is the unit a caller retracts by when its
   * document is taught or ingested again. Returns how many went; a run the
   * store never held removes nothing.
   */
  retractRun(sourceRunId: string): Promise<number>;
  /**
   * One point gone, by the run it was digested from and its ref within that
   * run — a fact since corrected, when the rest of its run still holds.
   * Answers the memory as it was held, because the store keeps nothing of a
   * point once it is gone. A point the store never held removes nothing, and
   * so does one this build cannot read, which stays where it is.
   */
  retractPoint(point: PointRef): Promise<PointRetraction>;
}

export interface EmbeddingCache {
  find(model: string, hashes: readonly string[]): Promise<Map<string, number[]>>;
  save(model: string, entries: readonly { hash: string; vector: number[] }[]): Promise<void>;
}

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
