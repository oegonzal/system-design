/**
 * In-memory stand-ins for the memory module's adapters: an embedding client
 * with deterministic vectors, a store that ranks by cosine the way Qdrant
 * does, and a cache. Pure helpers only — no vitest imports.
 */
import { createHash } from 'node:crypto';

import type { MemoryStoreAvailabilityDto } from '@sysdesign/contracts';
import type { EmbeddingClient } from '@sysdesign/llm';

import { CachedEmbeddings } from '../../orchestrators/memory/embeddings';
import type {
  ChunkKindScope,
  EmbeddingCache,
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

export function vectorOf(text: string, dimensions = 8): number[] {
  const digest = createHash('sha256').update(text, 'utf8').digest();
  const raw = Array.from(
    { length: dimensions },
    (_, index) => digest[index % digest.length] / 255 - 0.5,
  );
  const norm = Math.hypot(...raw) || 1;
  return raw.map((value) => value / norm);
}

/** Embeddings whose provider answers nothing — the `embedding-failed` path. */
export const mutedEmbeddings = (): CachedEmbeddings =>
  new CachedEmbeddings(
    { ...fakeEmbeddings(), embed: () => Promise.resolve(null) },
    new InMemoryEmbeddingCache(),
  );

/**
 * The adapter's declared filter, applied the way Qdrant applies it: each field
 * narrows, an empty list narrows nothing. This fake is a hand-written mirror of
 * the adapter, so a rule added to one and not the other passes every fast spec
 * and diverges only in production — which is why it lives beside the cosine.
 */
const passes = (chunk: StoredChunk, filter: ProbeFilter | undefined): boolean => {
  if (filter === undefined) return true;
  const within = (values: readonly string[] | undefined, value: string): boolean =>
    values === undefined || values.length === 0 || values.includes(value);
  return (
    within(filter.kinds, chunk.source.kind) &&
    within(filter.pipelines, chunk.source.pipeline) &&
    !(filter.notRunIds ?? []).includes(chunk.source.runId)
  );
};

const cosine = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0) /
  ((Math.hypot(...a) || 1) * (Math.hypot(...b) || 1));

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
    return distinct.slice(0, limit).map(({ chunk, score }) => ({
      text: chunk.text,
      contentHash: chunk.contentHash,
      source: chunk.source,
      evidence: chunk.evidence,
      digestRunId: chunk.digestRunId,
      lineage: chunk.lineage,
      model: chunk.model,
      score,
      ...(chunk.facets === undefined ? {} : { facets: chunk.facets }),
    }));
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
    return Promise.resolve({ status: 'removed', memory: held });
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
