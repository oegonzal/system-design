import { randomUUID } from 'node:crypto';

import { QdrantClient } from '@qdrant/js-client-rest';

import type { PointPayload, VisibilityFilter } from '../../ports';
import { pointVisible } from '../../testing/in-memory-vector-index';
import { collectionName } from './collection';
import { QdrantVectorIndex } from './qdrant-vector-index';

const url = process.env['QDRANT_URL'] || 'http://localhost:6333';
const client = new QdrantClient({ url, checkCompatibility: false });

/** A model nobody else embeds with, so this run's collection is its own and is dropped after. */
const model = `spec-${randomUUID()}`;
const DIMENSIONS = 4;
const SCOPE_KEYS = ['tenant', 'user'];
const index = new QdrantVectorIndex(client, { model, dimensions: DIMENSIONS }, SCOPE_KEYS);

const NOW = new Date('2026-10-01T00:00:00.000Z');
const daysFromNow = (days: number): string =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const payload = (overrides: Partial<PointPayload> = {}): PointPayload => ({
  spaceId: 'space-1',
  register: 'facts',
  partition: 't1',
  scope: { tenant: 't1' },
  metadata: {},
  validFrom: daysFromNow(0),
  expiresAt: null,
  ...overrides,
});

const request = (overrides: Partial<VisibilityFilter> = {}): VisibilityFilter => ({
  spaceId: 'space-1',
  registers: ['facts'],
  partition: 't1',
  scope: { tenant: 't1' },
  scopeKeys: SCOPE_KEYS,
  now: NOW,
  ...overrides,
});

beforeAll(async () => {
  await client.getCollections().catch((error: unknown) => {
    throw new Error(`qdrant is not reachable at ${url}: ${String(error)}`);
  });
});

afterAll(async () => {
  const name = collectionName(model, DIMENSIONS);
  if ((await client.collectionExists(name)).exists) await client.deleteCollection(name);
});

describe('the Qdrant vector index', () => {
  it('[AGM-9] binds its collection to the embedding model and width, with the indexes its filter reads', async () => {
    expect(index.collection).toBe(`agentic-memory__v1__${model}__${DIMENSIONS}`);
    await index.upsert([
      { id: id(1), vector: [1, 0, 0, 0], payload: payload({ spaceId: 'space-binding' }) },
    ]);

    const info = await client.getCollection(`agentic-memory__v1__${model}__${DIMENSIONS}`);
    expect(info.config.params.vectors).toMatchObject({ size: DIMENSIONS, distance: 'Cosine' });
    const indexed = Object.entries(info.payload_schema).map(([field, schema]) => [
      field,
      schema?.data_type,
    ]);
    expect(Object.fromEntries(indexed)).toEqual({
      spaceId: 'keyword',
      register: 'keyword',
      partition: 'keyword',
      validFrom: 'datetime',
      expiresAt: 'datetime',
      'scope.user': 'keyword',
    });
  });

  it('[AGM-9] holds nothing without a model, and never reaches the server', async () => {
    const unreachable = new QdrantClient({
      url: 'http://127.0.0.1:1',
      checkCompatibility: false,
      timeout: 500,
    });
    const disabled = new QdrantVectorIndex(unreachable, { model: null, dimensions: 0 }, SCOPE_KEYS);
    expect(disabled.collection).toBeNull();
    await disabled.upsert([{ id: id(1), vector: [1, 0, 0, 0], payload: payload() }]);
    await disabled.remove([id(1)]);
    expect(await disabled.search({ vector: [1, 0, 0, 0], limit: 5, filter: request() })).toEqual(
      [],
    );
  });

  it('[AGM-10] finds what it upserted, nearest first, until it is removed', async () => {
    const filter = request({ spaceId: 'space-round-trip' });
    const point = (n: number, vector: number[]) => ({
      id: id(n),
      vector,
      payload: payload({ spaceId: 'space-round-trip' }),
    });
    await index.upsert([point(11, [1, 0, 0, 0]), point(12, [0, 1, 0, 0])]);
    const hits = await index.search({ vector: [1, 0.2, 0, 0], limit: 5, filter });
    expect(hits.map((hit) => hit.id)).toEqual([id(11), id(12)]);
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);

    await index.remove([id(11), id(99)]);
    expect(
      (await index.search({ vector: [1, 0.2, 0, 0], limit: 5, filter })).map((hit) => hit.id),
    ).toEqual([id(12)]);
  });

  it('[AGM-7] [AGM-10] filters a search exactly as the in-memory index does: a tenant-wide memory reaches a user, a user’s memory no tenant-wide request', async () => {
    const inSpace = (overrides: Partial<PointPayload>) =>
      payload({ spaceId: 'space-visibility', ...overrides });
    const points: { id: string; payload: PointPayload }[] = [
      { id: id(21), payload: inSpace({}) },
      { id: id(22), payload: inSpace({ scope: { tenant: 't1', user: 'u1' } }) },
      { id: id(23), payload: inSpace({ scope: { tenant: 't1', user: 'u2' } }) },
      { id: id(24), payload: inSpace({ expiresAt: daysFromNow(-1) }) },
      { id: id(25), payload: inSpace({ expiresAt: daysFromNow(1) }) },
      { id: id(26), payload: inSpace({ partition: 't2', scope: { tenant: 't2' } }) },
      { id: id(27), payload: inSpace({ register: 'episodes' }) },
      { id: id(28), payload: inSpace({ metadata: { topic: 'x' } }) },
      { id: id(29), payload: inSpace({ validFrom: daysFromNow(-10) }) },
    ];
    await index.upsert(points.map((point) => ({ ...point, vector: [1, 1, 0, 0] })));

    const visibleIn = async (filter: VisibilityFilter): Promise<string[]> =>
      (await index.search({ vector: [1, 1, 0, 0], limit: points.length, filter }))
        .map((hit) => hit.id)
        .sort();
    const tenantWide = request({ spaceId: 'space-visibility' });
    const user = request({ spaceId: 'space-visibility', scope: { tenant: 't1', user: 'u1' } });
    const filters = [
      tenantWide,
      user,
      { ...tenantWide, registers: ['facts', 'episodes'] },
      { ...tenantWide, registers: [] },
      { ...tenantWide, where: { topic: 'x' } },
      { ...tenantWide, since: new Date(daysFromNow(-5)) },
      { ...tenantWide, until: new Date(daysFromNow(-5)) },
      { ...tenantWide, partition: 't2', scope: { tenant: 't2' } },
    ];
    for (const filter of filters) {
      const expected = points
        .filter((point) => pointVisible(point.payload, filter))
        .map((point) => point.id);
      expect(await visibleIn(filter)).toEqual(expected.sort());
    }

    expect(await visibleIn(tenantWide)).not.toContain(id(22));
    expect(await visibleIn(user)).toEqual(expect.arrayContaining([id(21), id(22)]));
    expect(await visibleIn(user)).not.toContain(id(23));
  });
});
