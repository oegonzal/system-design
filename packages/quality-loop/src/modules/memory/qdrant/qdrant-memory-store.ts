/**
 * The vector store adapter. The collection is created on first use and every
 * write waits for the server, so a memory a run just stored is searchable by
 * the next one. `verify` never throws: the store's state is reported as data.
 */
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { MemoryStoreAvailabilityDto } from '@sysdesign/contracts';

import type { MemoryHit, MemoryStore, StoredChunk } from '../ports';
import { collectionName, fromPayload, INDEXED_FIELDS, pointId, toPayload } from './collection';

export const DEFAULT_QDRANT_URL = 'http://localhost:6333';

/** Over-fetch before deduping identical lessons from repeated runs of one prompt. */
const DEDUPE_FACTOR = 3;

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class QdrantMemoryStore implements MemoryStore {
  private readonly collection: string | null;
  private ensured = false;

  constructor(
    private readonly client: QdrantClient,
    private readonly model: string | null,
    private readonly dimensions: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.collection = model === null ? null : collectionName(model, dimensions);
  }

  async verify(): Promise<MemoryStoreAvailabilityDto> {
    const { model, collection } = this;
    if (collection === null) {
      return { ready: false, reason: 'no-model', note: null, model, collection, chunks: 0 };
    }
    try {
      await this.ensure(collection);
      const { count } = await this.client.count(collection, { exact: true });
      return { ready: true, reason: null, note: null, model, collection, chunks: count };
    } catch (error) {
      this.ensured = false;
      return {
        ready: false,
        reason: 'unreachable',
        note: describe(error),
        model,
        collection,
        chunks: 0,
      };
    }
  }

  async search(vector: readonly number[], limit: number): Promise<MemoryHit[]> {
    const collection = await this.bound();
    const response = await this.client.query(collection, {
      query: [...vector],
      limit: limit * DEDUPE_FACTOR,
      with_payload: true,
    });
    const seen = new Set<string>();
    const hits: MemoryHit[] = [];
    for (const point of response.points) {
      const hit = fromPayload(point.payload, point.score);
      if (hit === null || seen.has(hit.contentHash)) continue;
      seen.add(hit.contentHash);
      hits.push(hit);
      if (hits.length === limit) break;
    }
    return hits;
  }

  async replaceRunChunks(sourceRunId: string, chunks: readonly StoredChunk[]): Promise<number> {
    const collection = await this.bound();
    await this.client.delete(collection, {
      wait: true,
      filter: { must: [{ key: 'runId', match: { value: sourceRunId } }] },
    });
    if (chunks.length === 0) return 0;
    const storedAt = this.now().toISOString();
    await this.client.upsert(collection, {
      wait: true,
      points: chunks.map((chunk) => ({
        id: pointId(sourceRunId, chunk.source.ref),
        vector: chunk.vector,
        payload: toPayload(chunk, storedAt),
      })),
    });
    return chunks.length;
  }

  private async bound(): Promise<string> {
    if (this.collection === null) throw new Error('memory store: no embedding model to bind to');
    await this.ensure(this.collection);
    return this.collection;
  }

  private async ensure(collection: string): Promise<void> {
    if (this.ensured) return;
    const { exists } = await this.client.collectionExists(collection);
    if (!exists) {
      // Two processes may boot at once: the loser of the create re-checks instead of failing.
      await this.client
        .createCollection(collection, { vectors: { size: this.dimensions, distance: 'Cosine' } })
        .catch(async (error: unknown) => {
          if (!(await this.client.collectionExists(collection)).exists) throw error;
        });
      for (const field of INDEXED_FIELDS) {
        await this.client.createPayloadIndex(collection, {
          field_name: field,
          field_schema: 'keyword',
          wait: true,
        });
      }
    }
    this.ensured = true;
  }
}
