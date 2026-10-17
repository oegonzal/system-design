/**
 * The vector index in Qdrant, a rebuildable projection of the current records
 * Postgres keeps. Its collection is bound to the embedder's model and width;
 * it and its payload indexes are ensured once, on first use. A point is a
 * record's id, one unnamed cosine vector and the payload the engine built —
 * never the text — and every write waits for the server, so a point is
 * searchable as soon as the call returns. Without a model there is no
 * collection: a write does nothing and a search finds nothing.
 */
import type { QdrantClient } from '@qdrant/js-client-rest';

import { messageOf } from '../../errors';
import type { PointPayload, VectorIndex, VisibilityFilter } from '../../ports';
import { collectionName, filterOf, payloadIndexes } from './collection';

export class QdrantVectorIndex implements VectorIndex {
  readonly collection: string | null;
  private ensuring: Promise<void> | null = null;

  constructor(
    private readonly client: QdrantClient,
    private readonly embedder: { model: string | null; dimensions: number },
    private readonly scopeKeys: readonly string[],
    private readonly warn: (message: string) => void = () => undefined,
  ) {
    this.collection =
      embedder.model === null ? null : collectionName(embedder.model, embedder.dimensions);
  }

  async upsert(
    points: readonly { id: string; vector: readonly number[]; payload: PointPayload }[],
  ): Promise<void> {
    const { collection } = this;
    if (collection === null || points.length === 0) return;
    await this.ensure(collection);
    await this.client.upsert(collection, {
      wait: true,
      points: points.map((point) => ({
        id: point.id,
        vector: [...point.vector],
        payload: { ...point.payload },
      })),
    });
  }

  async remove(ids: readonly string[]): Promise<void> {
    const { collection } = this;
    if (collection === null || ids.length === 0) return;
    await this.ensure(collection);
    await this.client.delete(collection, { wait: true, points: [...ids] });
  }

  /** Ids and scores only: Postgres validates every hit, so the payload never needs to come back. */
  async search(query: {
    vector: readonly number[];
    limit: number;
    filter: VisibilityFilter;
  }): Promise<{ id: string; score: number }[]> {
    const { collection } = this;
    if (collection === null) return [];
    await this.ensure(collection);
    const { points } = await this.client.query(collection, {
      query: [...query.vector],
      limit: query.limit,
      filter: filterOf(query.filter),
      with_payload: false,
    });
    return points.map((point) => ({ id: String(point.id), score: point.score }));
  }

  /** Once per process; a failed attempt is forgotten, so the next operation tries again. */
  private ensure(collection: string): Promise<void> {
    this.ensuring ??= this.prepare(collection).catch((error: unknown) => {
      this.ensuring = null;
      throw error;
    });
    return this.ensuring;
  }

  /** The collection, made when missing, and every payload index asked for. */
  private async prepare(collection: string): Promise<void> {
    if (!(await this.client.collectionExists(collection)).exists) {
      const vectors = { size: this.embedder.dimensions, distance: 'Cosine' as const };
      // Two processes may boot at once: the loser of the create checks again instead of failing.
      await this.client.createCollection(collection, { vectors }).catch(async (error: unknown) => {
        if (!(await this.client.collectionExists(collection)).exists) throw error;
      });
    }
    // Asked for even when the collection already stood — asking for an index
    // that exists is a no-op — so a scope key a later policy declares is
    // indexed too. A refusal is reported, not fatal: an unindexed field makes a
    // slower filter, never a wrong one.
    for (const { field, schema } of payloadIndexes(this.scopeKeys)) {
      try {
        await this.client.createPayloadIndex(collection, {
          field_name: field,
          field_schema: schema,
          wait: true,
        });
      } catch (error) {
        this.warn(
          `vector index: payload index ${field} not ensured on ${collection}: ${messageOf(error)}`,
        );
      }
    }
  }
}
