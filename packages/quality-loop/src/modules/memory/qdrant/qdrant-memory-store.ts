/**
 * The vector store adapter. The collection is created on first use and every
 * write waits for the server, so a memory a run just stored is searchable by
 * the next one. `verify` never throws: the store's state is reported as data.
 */
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { MemoryStoreAvailabilityDto } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import {
  VECTOR_NAMES,
  type ChunkKindScope,
  type MemoryHit,
  type MemoryProbe,
  type MemoryStore,
  type PointRef,
  type ProbeFilter,
  type StoredChunk,
} from '../../../orchestrators/memory/ports';
import { collectionName, fromPayload, INDEXED_FIELDS, pointId, toPayload } from './collection';

export const DEFAULT_QDRANT_URL = 'http://localhost:6333';

/** Over-fetch before deduping identical lessons from repeated runs of one prompt. */
const DEDUPE_FACTOR = 3;

/** One `match: any` clause, or nothing when the list is empty: an empty list narrows nothing. */
const anyOf = (key: string, values: readonly string[] | undefined) =>
  values === undefined || values.length === 0 ? [] : [{ key, match: { any: [...values] } }];

/**
 * A probe's declared filter as Qdrant states one, or undefined when it narrows
 * nothing — in which case the search is exactly the unfiltered search it was
 * before filters existed.
 */
function filterOf(filter: ProbeFilter | undefined): Record<string, unknown> | undefined {
  if (filter === undefined) return undefined;
  const must = [...anyOf('kind', filter.kinds), ...anyOf('pipeline', filter.pipelines)];
  const mustNot = anyOf('runId', filter.notRunIds);
  if (must.length === 0 && mustNot.length === 0) return undefined;
  return {
    ...(must.length === 0 ? {} : { must }),
    ...(mustNot.length === 0 ? {} : { must_not: mustNot }),
  };
}

export class QdrantMemoryStore implements MemoryStore {
  private readonly collection: string | null;
  private ensured = false;

  constructor(
    private readonly client: QdrantClient,
    private readonly model: string | null,
    private readonly dimensions: number,
    private readonly now: () => Date = () => new Date(),
    private readonly warn: (message: string) => void = () => undefined,
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
        note: describeError(error).message,
        model,
        collection,
        chunks: 0,
      };
    }
  }

  async searchMany(probes: readonly MemoryProbe[]): Promise<MemoryHit[][]> {
    if (probes.length === 0) return [];
    const collection = await this.bound();
    const responses = await this.client.queryBatch(collection, {
      searches: probes.map((probe) => {
        const filter = filterOf(probe.filter);
        return {
          query: [...probe.vector],
          using: probe.using,
          limit: probe.limit * DEDUPE_FACTOR,
          with_payload: true,
          ...(filter === undefined ? {} : { filter }),
        };
      }),
    });
    return responses.map((response, index) => {
      const seen = new Set<string>();
      const hits: MemoryHit[] = [];
      for (const point of response.points) {
        const hit = fromPayload(point.payload, point.score);
        if (hit === null || seen.has(hit.contentHash)) continue;
        seen.add(hit.contentHash);
        hits.push(hit);
        if (hits.length === probes[index].limit) break;
      }
      return hits;
    });
  }

  async replaceRunChunks(
    sourceRunId: string,
    chunks: readonly StoredChunk[],
    scope?: ChunkKindScope,
  ): Promise<number> {
    const collection = await this.bound();
    await this.client.delete(collection, {
      wait: true,
      filter: {
        must: [{ key: 'runId', match: { value: sourceRunId } }, ...anyOf('kind', scope?.kinds)],
      },
    });
    if (chunks.length === 0) return 0;
    const storedAt = this.now().toISOString();
    await this.client.upsert(collection, {
      wait: true,
      points: chunks.map((chunk) => ({
        id: pointId(sourceRunId, chunk.source.ref),
        vector: chunk.vectors,
        payload: toPayload(chunk, storedAt),
      })),
    });
    return chunks.length;
  }

  /**
   * Write the support counts of points that already stand, leaving the rest of
   * each payload alone. One call per point, because each carries its own
   * counts — and each selects its point by `(runId, ref)` rather than by id,
   * because a point that has since gone must be skipped: asking for an id the
   * collection does not hold is a 404, while a filter that matches nothing is
   * a no-op, which is the behaviour this wants.
   */
  async setSupport(
    updates: readonly { point: PointRef; support: { confirms: number; contradicts: number } }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const collection = await this.bound();
    await Promise.all(
      updates.map((update) =>
        this.client.setPayload(collection, {
          wait: true,
          payload: { support: update.support },
          filter: {
            must: [
              { key: 'runId', match: { value: update.point.runId } },
              { key: 'ref', match: { value: update.point.ref } },
            ],
          },
        }),
      ),
    );
  }

  private async bound(): Promise<string> {
    if (this.collection === null) throw new Error('memory store: no embedding model to bind to');
    await this.ensure(this.collection);
    return this.collection;
  }

  /**
   * The collection exists and every declared payload index has been asked
   * for — on every boot rather than only with the collection, so a field
   * declared after a collection was built (a facet, the lineage paths) is
   * indexed on the next boot without a generation bump.
   */
  private async ensure(collection: string): Promise<void> {
    if (this.ensured) return;
    const { exists } = await this.client.collectionExists(collection);
    if (!exists) {
      // Two processes may boot at once: the loser of the create re-checks instead of failing.
      const vectors = Object.fromEntries(
        VECTOR_NAMES.map((name) => [name, { size: this.dimensions, distance: 'Cosine' as const }]),
      );
      await this.client.createCollection(collection, { vectors }).catch(async (error: unknown) => {
        if (!(await this.client.collectionExists(collection)).exists) throw error;
      });
    }
    // Every boot, not only at creation: a facet added to INDEXED_FIELDS has to
    // reach the collection that already holds the corpus, and asking for an
    // index that exists is a no-op. A refusal here is not fatal — an
    // unindexed facet is a slower filter, not a wrong answer — so it is
    // reported and the store stays usable. The index type comes from the
    // field's own declaration: a keyword index on a numeric field is accepted
    // and then matches no integer filter, which would read as an empty result
    // rather than as a failure.
    for (const [field, schema] of Object.entries(INDEXED_FIELDS)) {
      try {
        await this.client.createPayloadIndex(collection, {
          field_name: field,
          field_schema: schema,
          wait: true,
        });
      } catch (error) {
        this.warn(
          `memory store: payload index ${field} not ensured — ${describeError(error).message}`,
        );
      }
    }
    this.ensured = true;
  }
}
