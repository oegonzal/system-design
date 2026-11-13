import { randomUUID } from 'node:crypto';

import { MikroORM } from '@mikro-orm/postgresql';
import { ensureDatabase, mikroOrmExecutor, ormOptions } from '@sysdesign/db';
import { tableName, type SqlExecutor } from '@sysdesign/pgvector-kit';
import { cosine, hashedUnitVector } from '@sysdesign/pgvector-kit/testing';

import type { PointPayload, VisibilityFilter } from '../../ports';
import { InMemoryVectorIndex, pointVisible } from '../../testing/in-memory-vector-index';
import { collectionName } from './collection';
import { PgvectorVectorIndex } from './pgvector-vector-index';

/**
 * The index on the lane database, against the in-memory index that states
 * its contract. Its table is the one the spec's embedder names, made on
 * first use and left standing: only a migration or a guarded door may spell
 * the statement that removes a table (tooling/test-database-guarantees), so
 * each run keeps to spaces and ids carrying its own tag and removes its rows
 * after.
 */
const MODEL = 'spec-pgvector';
const DIMENSIONS = 4;
const SCOPE_KEYS = ['tenant', 'user'];
const TABLE = tableName(collectionName(MODEL, DIMENSIONS));

/** This run's tag: on every space it writes to, and in every id it writes. */
const RUN = randomUUID();
const space = (name: string): string => `${RUN}:${name}`;
const id = (n: number): string =>
  `${RUN.slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const NOW = new Date('2026-10-01T00:00:00.000Z');
const daysFromNow = (days: number): string =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

const payload = (overrides: Partial<PointPayload> = {}): PointPayload => ({
  spaceId: space('default'),
  register: 'facts',
  partition: 't1',
  scope: { tenant: 't1' },
  metadata: {},
  validFrom: daysFromNow(0),
  expiresAt: null,
  ...overrides,
});

const request = (overrides: Partial<VisibilityFilter> = {}): VisibilityFilter => ({
  spaceId: space('default'),
  registers: ['facts'],
  partition: 't1',
  scope: { tenant: 't1' },
  scopeKeys: SCOPE_KEYS,
  now: NOW,
  ...overrides,
});

let orm: MikroORM;
let sql: SqlExecutor;
let index: PgvectorVectorIndex;

beforeAll(async () => {
  await ensureDatabase();
  orm = await MikroORM.init(ormOptions);
  sql = mikroOrmExecutor(orm.em);
  index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
}, 60_000);

afterAll(async () => {
  const standing = await sql.one('select 1 from pg_tables where tablename = ?', [TABLE]);
  if (standing !== undefined) {
    await sql.run(`delete from "${TABLE}" where space_id like ?`, [`${RUN}:%`]);
  }
  await orm.close(true);
});

/** The ids a search finds, in no order. */
const found = async (
  searched: Pick<PgvectorVectorIndex, 'search'>,
  vector: readonly number[],
  filter: VisibilityFilter,
  limit = 50,
): Promise<string[]> =>
  (await searched.search({ vector, limit, filter })).map((hit) => hit.id).sort();

describe('the pgvector vector index', () => {
  it('[AGM-9] binds its collection to the embedding model and width, and makes its table with the typed columns and the indexes its filter and ranking read', async () => {
    expect(index.collection).toBe(`agentic-memory__v2__${MODEL}__${DIMENSIONS}`);
    await index.upsert([
      { id: id(1), vector: [1, 0, 0, 0], payload: payload({ spaceId: space('binding') }) },
    ]);

    const columns = await sql.all<{ column_name: string; type: string }>(
      'select column_name, format_type(atttypid, atttypmod) as type from information_schema.columns ' +
        'join pg_attribute on attrelid = ?::regclass and attname = column_name ' +
        'where table_name = ? order by ordinal_position',
      [`"${TABLE}"`, TABLE],
    );
    expect(columns).toEqual([
      { column_name: 'id', type: 'uuid' },
      { column_name: 'space_id', type: 'text' },
      { column_name: 'register', type: 'text' },
      { column_name: 'partition', type: 'text' },
      { column_name: 'scope', type: 'jsonb' },
      { column_name: 'metadata', type: 'jsonb' },
      { column_name: 'valid_from', type: 'timestamp with time zone' },
      { column_name: 'expires_at', type: 'timestamp with time zone' },
      { column_name: 'embedding', type: `vector(${DIMENSIONS})` },
    ]);

    const indexes = await sql.all<{ indexname: string; indexdef: string }>(
      'select indexname, indexdef from pg_indexes where tablename = ? order by indexname',
      [TABLE],
    );
    expect(indexes.map((row) => row.indexname)).toEqual(
      [
        `${TABLE}_pkey`,
        `${TABLE}_space_partition_idx`,
        `${TABLE}_register_idx`,
        `${TABLE}_valid_from_idx`,
        `${TABLE}_expires_at_idx`,
        `${TABLE}_embedding_hnsw`,
      ].sort(),
    );
    const definitions = Object.fromEntries(indexes.map((row) => [row.indexname, row.indexdef]));
    expect(definitions[`${TABLE}_embedding_hnsw`]).toContain(
      'USING hnsw (embedding vector_cosine_ops)',
    );
    expect(definitions[`${TABLE}_space_partition_idx`]).toContain(
      'USING btree (space_id, partition)',
    );
  });

  it('[AGM-10] finds what it upserted, nearest first, scored by cosine, until it is removed', async () => {
    const filter = request({ spaceId: space('round-trip') });
    const point = (n: number, vector: number[]) => ({
      id: id(n),
      vector,
      payload: payload({ spaceId: space('round-trip') }),
    });
    await index.upsert([point(11, [1, 0, 0, 0]), point(12, [0, 1, 0, 0])]);
    const query = [1, 0.2, 0, 0];
    const hits = await index.search({ vector: query, limit: 5, filter });
    expect(hits.map((hit) => hit.id)).toEqual([id(11), id(12)]);
    expect(hits[0]?.score).toBeCloseTo(cosine(query, [1, 0, 0, 0]), 5);
    expect(hits[1]?.score).toBeCloseTo(cosine(query, [0, 1, 0, 0]), 5);

    await index.remove([id(11), id(99)]);
    expect(await found(index, query, filter)).toEqual([id(12)]);
  });

  it('[AGM-10] writes a point again under its id, the newer payload winning', async () => {
    const own = payload({ spaceId: space('again'), scope: { tenant: 't1', user: 'u1' } });
    await index.upsert([{ id: id(31), vector: [0, 0, 1, 0], payload: own }]);
    const tenantWide = request({ spaceId: space('again') });
    expect(await found(index, [0, 0, 1, 0], tenantWide)).toEqual([]);
    await index.upsert([
      { id: id(31), vector: [0, 0, 1, 0], payload: payload({ spaceId: space('again') }) },
    ]);
    expect(await found(index, [0, 0, 1, 0], tenantWide)).toEqual([id(31)]);
    expect(
      await sql.one<{ n: number }>(`select count(*)::int as n from "${TABLE}" where id = ?`, [
        id(31),
      ]),
    ).toEqual({ n: 1 });
  });

  it('[AGM-7] [AGM-10] filters a search exactly as the in-memory index does: a tenant-wide memory reaches a user, a user’s memory no tenant-wide request', async () => {
    const inSpace = (overrides: Partial<PointPayload>) =>
      payload({ spaceId: space('visibility'), ...overrides });
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
    const vector = [1, 1, 0, 0];
    const inMemory = new InMemoryVectorIndex(index.collection);
    await index.upsert(points.map((point) => ({ ...point, vector })));
    await inMemory.upsert(points.map((point) => ({ ...point, vector })));

    const tenantWide = request({ spaceId: space('visibility') });
    const user = request({ spaceId: space('visibility'), scope: { tenant: 't1', user: 'u1' } });
    const filters: VisibilityFilter[] = [
      tenantWide,
      user,
      { ...tenantWide, registers: ['facts', 'episodes'] },
      { ...tenantWide, registers: [] },
      { ...tenantWide, where: { topic: 'x' } },
      { ...tenantWide, where: { topic: 'y' } },
      { ...tenantWide, since: new Date(daysFromNow(-5)) },
      { ...tenantWide, until: new Date(daysFromNow(-5)) },
      { ...tenantWide, since: new Date(daysFromNow(-20)), until: new Date(daysFromNow(1)) },
      { ...tenantWide, now: new Date(daysFromNow(2)) },
      { ...tenantWide, partition: 't2', scope: { tenant: 't2' } },
      { ...tenantWide, scopeKeys: ['tenant'] },
      { ...user, scopeKeys: ['tenant', 'project', 'user'] },
    ];
    for (const filter of filters) {
      const expected = points
        .filter((point) => pointVisible(point.payload, filter))
        .map((point) => point.id)
        .sort();
      expect(await found(index, vector, filter)).toEqual(expected);
      expect(await found(inMemory, vector, filter)).toEqual(expected);
    }

    expect(await found(index, vector, tenantWide)).not.toContain(id(22));
    expect(await found(index, vector, user)).toEqual(expect.arrayContaining([id(21), id(22)]));
    expect(await found(index, vector, user)).not.toContain(id(23));
  });

  it('[AGM-10] ranks a filtered search as the in-memory index does, the limit honoured', async () => {
    const filter = request({ spaceId: space('ranking') });
    const points = Array.from({ length: 60 }, (_, n) => ({
      id: id(100 + n),
      vector: hashedUnitVector(`memory ${n}`, DIMENSIONS),
      payload: payload({
        spaceId: space('ranking'),
        scope: n % 3 === 0 ? { tenant: 't1', user: 'u9' } : { tenant: 't1' },
      }),
    }));
    const inMemory = new InMemoryVectorIndex(index.collection);
    await index.upsert(points);
    await inMemory.upsert(points);

    const query = hashedUnitVector('what was asked', DIMENSIONS);
    const expected = await inMemory.search({ vector: query, limit: 5, filter });
    const hits = await index.search({ vector: query, limit: 5, filter });
    expect(hits).toHaveLength(5);
    expect(hits.map((hit) => hit.id)).toEqual(expected.map((hit) => hit.id));
    hits.forEach((hit, position) =>
      expect(hit.score).toBeCloseTo(expected[position]?.score ?? Number.NaN, 5),
    );
  });
});
