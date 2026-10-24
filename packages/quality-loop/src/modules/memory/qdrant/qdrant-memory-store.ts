/**
 * The vector store adapter. The collection is created on first use and every
 * write waits for the server, so a memory a run just stored is searchable by
 * the next one. `verify` never throws: the store's state is reported as data.
 */
import type { QdrantClient } from '@qdrant/js-client-rest';
import {
  UNIT_BOUND_SCOPES,
  type MemoryScope,
  type MemoryStoreAvailabilityDto,
} from '@sysdesign/contracts';
import { ensureCollection } from '@sysdesign/qdrant-kit';
import { describeError } from '@sysdesign/run-dump';

import {
  VECTOR_NAMES,
  type ChunkKindScope,
  type MemoryHit,
  type MemoryProbe,
  type MemoryStore,
  type PointRef,
  type PointRetraction,
  type ProbeFilter,
  type StoredChunk,
} from '../../../orchestrators/memory/ports';
import { collectionName, fromPayload, INDEXED_FIELDS, pointId, toPayload } from './collection';

/** Over-fetch before deduping identical lessons from repeated runs of one prompt. */
const DEDUPE_FACTOR = 3;

/** One `match: any` clause, or nothing when the list is empty: an empty list narrows nothing. */
const anyOf = (key: string, values: readonly string[] | undefined) =>
  values === undefined || values.length === 0 ? [] : [{ key, match: { any: [...values] } }];

/**
 * What every search leaves out: a memory of a scope bound to a unit of work
 * (`bound`) — every such memory when the search names no unit, and every one
 * recorded for another unit, or for none, when it names `unitKey`. A memory
 * of any other scope, or of none (a lesson, a fact stored before scopes),
 * matches no clause here and is always read. Inside the filter, so a slot an
 * excluded memory would have taken is refilled from below. With no bound
 * scope there is nothing to leave out, and no clause: an empty `must` nested
 * in a `must_not` would leave out every memory but the named unit's.
 */
export function unitExclusion(
  bound: readonly MemoryScope[],
  unitKey: string | undefined,
): Record<string, unknown>[] {
  const boundScope = anyOf('scope', bound);
  if (boundScope.length === 0) return [];
  if (unitKey === undefined) return boundScope;
  return [{ must: boundScope, must_not: [{ key: 'unitKey', match: { value: unitKey } }] }];
}

/** A probe's declared filter as Qdrant states one: what it narrows to, and what every search leaves out. */
function filterOf(filter: ProbeFilter | undefined): Record<string, unknown> {
  const must = [...anyOf('kind', filter?.kinds), ...anyOf('pipeline', filter?.pipelines)];
  const mustNot = [
    ...anyOf('runId', filter?.notRunIds),
    ...unitExclusion(UNIT_BOUND_SCOPES, filter?.unitKey),
  ];
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
      searches: probes.map((probe) => ({
        query: [...probe.vector],
        using: probe.using,
        limit: probe.limit * DEDUPE_FACTOR,
        with_payload: true,
        filter: filterOf(probe.filter),
      })),
    });
    return responses.map((response, index) => {
      const seen = new Set<string>();
      const hits: MemoryHit[] = [];
      for (const point of response.points) {
        const memory = fromPayload(point.payload);
        if (memory === null || seen.has(memory.contentHash)) continue;
        seen.add(memory.contentHash);
        hits.push({ ...memory, score: point.score });
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

  async retractRun(sourceRunId: string): Promise<number> {
    const collection = await this.bound();
    const filter = { must: [{ key: 'runId', match: { value: sourceRunId } }] };
    const { count } = await this.client.count(collection, { filter, exact: true });
    if (count > 0) await this.client.delete(collection, { wait: true, filter });
    return count;
  }

  /**
   * Read before it goes, by id: the id is a pure function of `(runId, ref)`,
   * and a retrieve answers only the ids the collection holds, so a point never
   * stored comes back as nothing and nothing is deleted. A point whose payload
   * this module would not write is none of its memories — a search skips it —
   * so it is left standing and answered as unreadable, never as absent.
   */
  async retractPoint(point: PointRef): Promise<PointRetraction> {
    const collection = await this.bound();
    const id = pointId(point.runId, point.ref);
    const held = (await this.client.retrieve(collection, { ids: [id], with_payload: true })).at(0);
    if (held === undefined) return { status: 'not-held' };
    const memory = fromPayload(held.payload);
    if (memory === null) return { status: 'unreadable' };
    await this.client.delete(collection, { wait: true, points: [id] });
    return { status: 'removed', memory };
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
   * indexed on the next boot without a generation bump. The index type comes
   * from the field's own declaration: a keyword index on a numeric field is
   * accepted and then matches no integer filter, which would read as an empty
   * result rather than as a failure.
   */
  private async ensure(collection: string): Promise<void> {
    if (this.ensured) return;
    await ensureCollection(
      this.client,
      collection,
      {
        vectors: Object.fromEntries(
          VECTOR_NAMES.map((name) => [
            name,
            { size: this.dimensions, distance: 'Cosine' as const },
          ]),
        ),
        payloadIndexes: Object.entries(INDEXED_FIELDS).map(([field, schema]) => ({
          field,
          schema,
        })),
      },
      (message) => this.warn(`memory store: ${message}`),
    );
    this.ensured = true;
  }
}
