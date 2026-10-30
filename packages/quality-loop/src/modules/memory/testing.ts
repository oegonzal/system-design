/**
 * In-memory stand-ins for the memory module's adapters: an embedding client
 * with deterministic vectors, a store that ranks by cosine the way Qdrant
 * does, and a cache. Pure helpers only — no vitest imports.
 */
import { isUnitBound, type MemoryStoreAvailabilityDto } from '@sysdesign/contracts';
import type { EmbeddingClient } from '@sysdesign/llm';
import { cosine, hashedUnitVector } from '@sysdesign/qdrant-kit/testing';

import { CachedEmbeddings } from '../../orchestrators/memory/embeddings';
import type {
  ChunkKindScope,
  EmbeddingCache,
  MemoryChunk,
  MemoryHit,
  MemoryProbe,
  MemoryStore,
  PointRef,
  PointRetraction,
  ProbeFilter,
  StoredChunk,
} from '../../orchestrators/memory/ports';
import { FAKE_MODEL } from '../../orchestrators/memory/testing';
import { collectionName, pointId } from './qdrant/collection';

/** Deterministic vectors from the text's hash: equal texts embed equally, others differ. */
export function fakeEmbeddings(
  dimensions = 8,
): EmbeddingClient & { calls: string[][]; model: string } {
  const calls: string[][] = [];
  return {
    enabled: true,
    reason: null,
    model: FAKE_MODEL,
    dimensions,
    calls,
    embed: (inputs) => {
      calls.push([...inputs]);
      return Promise.resolve(inputs.map((text) => vectorOf(text, dimensions)));
    },
  };
}

/** The fake's vector for a text, at the width its specs embed by default. */
export const vectorOf = (text: string, dimensions = 8): number[] =>
  hashedUnitVector(text, dimensions);

/**
 * A memory as a store keeps it: indexed by both halves the way a digest's are
 * — the condition it applies when, and the lesson itself — each embedded as
 * `fakeEmbeddings` would embed it, with every optional field it carries.
 */
export const storedChunkOf = ({ score, ...memory }: MemoryHit, dimensions = 8): StoredChunk => {
  void score;
  const keys = { condition: `when ${memory.text}`, lesson: memory.text };
  return {
    ...memory,
    keys,
    vectors: {
      condition: vectorOf(keys.condition, dimensions),
      lesson: vectorOf(keys.lesson, dimensions),
    },
  };
};

/** Embeddings whose provider answers nothing — the `embedding-failed` path. */
export const mutedEmbeddings = (): CachedEmbeddings =>
  new CachedEmbeddings(
    { ...fakeEmbeddings(), embed: () => Promise.resolve(null) },
    new InMemoryEmbeddingCache(),
  );

/**
 * The adapter's declared filter, applied the way Qdrant applies it: each field
 * narrows, an empty list narrows nothing, and a memory bound to a unit of work
 * passes only a search naming the unit it was recorded for — whatever else the
 * search narrows by, or with no filter at all. This fake is a hand-written
 * mirror of the adapter, so a rule added to one and not the other passes every
 * fast spec and diverges only in production — which is why it lives beside the
 * cosine, and why a spec holds the two to the same hits on a real Qdrant.
 */
const passes = (chunk: StoredChunk, filter: ProbeFilter | undefined): boolean => {
  const within = (values: readonly string[] | undefined, value: string): boolean =>
    values === undefined || values.length === 0 || values.includes(value);
  return (
    within(filter?.kinds, chunk.source.kind) &&
    within(filter?.pipelines, chunk.source.pipeline) &&
    !(filter?.notRunIds ?? []).includes(chunk.source.runId) &&
    (!isUnitBound(chunk.scope) ||
      (filter?.unitKey !== undefined && chunk.unitKey === filter.unitKey))
  );
};

/**
 * A stored chunk as the adapter reads one back: the memory without what it is
 * indexed by — its keys and its vectors — and with every optional field it was
 * stored with, its scope and facets among them. One projection for a search's
 * hits and a retraction's answer, as the adapter has one payload reader.
 */
const memoryOf = ({ keys, vectors, ...memory }: StoredChunk): MemoryChunk => {
  void keys;
  void vectors;
  return memory;
};

export class InMemoryMemoryStore implements MemoryStore {
  readonly points = new Map<string, StoredChunk>();
  unreachable = false;

  constructor(
    private readonly model: string | null = FAKE_MODEL,
    private readonly dimensions = 8,
  ) {}

  verify(): Promise<MemoryStoreAvailabilityDto> {
    const collection = this.model === null ? null : collectionName(this.model, this.dimensions);
    if (this.model === null) {
      return Promise.resolve({
        ready: false,
        reason: 'no-model',
        note: null,
        model: null,
        collection,
        chunks: 0,
      });
    }
    if (this.unreachable) {
      return Promise.resolve({
        ready: false,
        reason: 'unreachable',
        note: 'store unreachable',
        model: this.model,
        collection,
        chunks: 0,
      });
    }
    return Promise.resolve({
      ready: true,
      reason: null,
      note: null,
      model: this.model,
      collection,
      chunks: this.points.size,
    });
  }

  searchMany(probes: readonly MemoryProbe[]): Promise<MemoryHit[][]> {
    // All-or-nothing, as the real batched call is: one bad probe loses them all.
    if (this.unreachable) return Promise.reject(new Error('store unreachable'));
    return Promise.resolve(probes.map((probe) => this.rank(probe, probe.limit)));
  }

  /** The closest chunks first, one per content hash, up to the probe's limit. */
  private rank(probe: MemoryProbe, limit: number): MemoryHit[] {
    const scored = [...this.points.values()]
      .filter((chunk) => passes(chunk, probe.filter))
      .map((chunk) => ({ chunk, score: cosine(probe.vector, chunk.vectors[probe.using]) }))
      .sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const distinct = scored.filter(({ chunk }) => {
      if (seen.has(chunk.contentHash)) return false;
      seen.add(chunk.contentHash);
      return true;
    });
    return distinct.slice(0, limit).map(({ chunk, score }) => ({ ...memoryOf(chunk), score }));
  }

  replaceRunChunks(
    sourceRunId: string,
    chunks: readonly StoredChunk[],
    scope?: ChunkKindScope,
  ): Promise<number> {
    if (this.unreachable) return Promise.reject(new Error('store unreachable'));
    for (const [id, chunk] of this.points) {
      const owned = scope === undefined || scope.kinds.includes(chunk.source.kind);
      if (chunk.source.runId === sourceRunId && owned) this.points.delete(id);
    }
    for (const chunk of chunks) this.points.set(pointId(sourceRunId, chunk.source.ref), chunk);
    return Promise.resolve(chunks.length);
  }

  retractRun(sourceRunId: string): Promise<number> {
    if (this.unreachable) return Promise.reject(new Error('store unreachable'));
    let removed = 0;
    for (const [id, chunk] of this.points) {
      if (chunk.source.runId !== sourceRunId) continue;
      this.points.delete(id);
      removed += 1;
    }
    return Promise.resolve(removed);
  }

  /**
   * As the adapter does: the point at `(runId, ref)` goes and answers as it was
   * held, and one never stored is not held. Every point here is a chunk this
   * build wrote, so none answers unreadable.
   */
  retractPoint(point: PointRef): Promise<PointRetraction> {
    if (this.unreachable) return Promise.reject(new Error('store unreachable'));
    const id = pointId(point.runId, point.ref);
    const held = this.points.get(id);
    if (held === undefined) return Promise.resolve({ status: 'not-held' });
    this.points.delete(id);
    return Promise.resolve({ status: 'removed', memory: memoryOf(held) });
  }

  /** As the adapter does: the counts are set on points that stand, and an unknown point is left alone. */
  setSupport(
    updates: readonly { point: PointRef; support: { confirms: number; contradicts: number } }[],
  ): Promise<void> {
    if (this.unreachable) return Promise.reject(new Error('store unreachable'));
    for (const update of updates) {
      const id = pointId(update.point.runId, update.point.ref);
      const chunk = this.points.get(id);
      if (chunk === undefined) continue;
      this.points.set(id, { ...chunk, facets: { ...chunk.facets, support: update.support } });
    }
    return Promise.resolve();
  }
}

export class InMemoryEmbeddingCache implements EmbeddingCache {
  readonly entries = new Map<string, number[]>();

  find(model: string, hashes: readonly string[]): Promise<Map<string, number[]>> {
    const found = new Map<string, number[]>();
    for (const hash of hashes) {
      const vector = this.entries.get(`${model}|${hash}`);
      if (vector) found.set(hash, vector);
    }
    return Promise.resolve(found);
  }

  save(model: string, entries: readonly { hash: string; vector: number[] }[]): Promise<void> {
    for (const entry of entries) this.entries.set(`${model}|${entry.hash}`, entry.vector);
    return Promise.resolve();
  }
}
