import { tableName, VectorExtensionMissing } from '@sysdesign/pgvector-kit';
import { recordingExecutor } from '@sysdesign/pgvector-kit/testing';

import type { PointPayload, VisibilityFilter } from '../../ports';
import { collectionName, schemaFor } from './collection';
import { PgvectorVectorIndex } from './pgvector-vector-index';

/**
 * The statements the index runs, read off a recording executor: what it
 * makes sure of and when, how a point is written, removed and searched for.
 * What those statements mean on a real table is the live spec's.
 */
const MODEL = 'spec-sql';
const DIMENSIONS = 4;
const TABLE = tableName(collectionName(MODEL, DIMENSIONS));
const SCHEMA = schemaFor(TABLE, DIMENSIONS);
const EXTENSION_CHECK = /^select 1 from pg_extension/;

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const payload = (overrides: Partial<PointPayload> = {}): PointPayload => ({
  spaceId: 'space-1',
  register: 'facts',
  partition: 't1',
  scope: { tenant: 't1' },
  metadata: {},
  validFrom: '2026-10-01T00:00:00.000Z',
  expiresAt: null,
  ...overrides,
});

const request = (overrides: Partial<VisibilityFilter> = {}): VisibilityFilter => ({
  spaceId: 'space-1',
  registers: ['facts'],
  partition: 't1',
  scope: { tenant: 't1' },
  scopeKeys: ['tenant', 'user'],
  now: new Date('2026-10-01T00:00:00.000Z'),
  ...overrides,
});

/** A database with the extension, every statement answering nothing but what `rows` scripts. */
const database = (rows: (sql: string) => readonly unknown[] | undefined = () => undefined) =>
  recordingExecutor((sql) => (EXTENSION_CHECK.test(sql) ? [{ installed: 1 }] : rows(sql)));

const point = (n: number, vector: number[] = [1, 0, 0, 0]) => ({
  id: id(n),
  vector,
  payload: payload(),
});

describe('what the pgvector index makes sure of', () => {
  it('[AGM-9] makes its table and indexes once, on first use, and never again while the process lives', async () => {
    const sql = database();
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    expect(sql.calls).toEqual([]);
    await index.upsert([point(1)]);
    expect(sql.calls[0]?.sql).toMatch(EXTENSION_CHECK);
    expect(sql.calls.slice(1, 1 + SCHEMA.length).map((call) => call.sql)).toEqual(SCHEMA);
    const before = sql.calls.length;
    await index.remove([id(1)]);
    await index.search({ vector: [1, 0, 0, 0], limit: 5, filter: request() });
    await index.upsert([point(2)]);
    const since = sql.calls.slice(before).map((call) => call.sql);
    expect(since.some((statement) => EXTENSION_CHECK.test(statement))).toBe(false);
    expect(since.some((statement) => statement.startsWith('create'))).toBe(false);
  });

  it('[AGM-9] forgets an ensure that failed, so the next operation tries again — and refuses a database without the extension by name', async () => {
    let installed = false;
    const sql = recordingExecutor((statement) =>
      EXTENSION_CHECK.test(statement) && installed ? [{ installed: 1 }] : undefined,
    );
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    await expect(index.upsert([point(1)])).rejects.toThrow(VectorExtensionMissing);
    await expect(index.remove([id(1)])).rejects.toThrow(/pnpm db:migrate/);
    expect(sql.calls.map((call) => call.sql)).toHaveLength(2);
    installed = true;
    await index.upsert([point(1)]);
    expect(sql.calls[2]?.sql).toMatch(EXTENSION_CHECK);
    expect(sql.calls.slice(3, 3 + SCHEMA.length).map((call) => call.sql)).toEqual(SCHEMA);
    expect(sql.calls.at(-1)?.sql).toMatch(/^insert into/);
  });

  it('[AGM-9] holds nothing without a model, and never reaches the database', async () => {
    const sql = database();
    const disabled = new PgvectorVectorIndex(sql, { model: null, dimensions: 0 });
    expect(disabled.collection).toBeNull();
    await disabled.upsert([point(1)]);
    await disabled.remove([id(1)]);
    expect(await disabled.search({ vector: [1, 0, 0, 0], limit: 5, filter: request() })).toEqual(
      [],
    );
    expect(sql.calls).toEqual([]);
  });
});

describe('the statements the pgvector index runs', () => {
  const COLUMNS =
    'id, space_id, register, partition, scope, metadata, valid_from, expires_at, embedding';
  const ROW = '(?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::timestamptz, ?::timestamptz, ?::vector)';

  it('[AGM-10] writes a point as one row, every column following the newer point on its id, the vector and the jsonb bound as literals', async () => {
    const sql = database();
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    await index.upsert([
      {
        id: id(1),
        vector: [0.5, -0.5, 0, 1e-7],
        payload: payload({
          scope: { tenant: 't1', user: 'u1' },
          metadata: { topic: 'x' },
          expiresAt: '2026-10-02T00:00:00.000Z',
        }),
      },
    ]);
    const insert = sql.calls.at(-1);
    expect(insert?.sql).toBe(
      `insert into "${TABLE}" (${COLUMNS}) values ${ROW} on conflict (id) do update set ` +
        'space_id = excluded.space_id, register = excluded.register, partition = excluded.partition, ' +
        'scope = excluded.scope, metadata = excluded.metadata, valid_from = excluded.valid_from, ' +
        'expires_at = excluded.expires_at, embedding = excluded.embedding',
    );
    expect(insert?.params).toEqual([
      id(1),
      'space-1',
      'facts',
      't1',
      '{"tenant":"t1","user":"u1"}',
      '{"topic":"x"}',
      '2026-10-01T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
      '[0.5,-0.5,0,1e-7]',
    ]);
  });

  it('[AGM-10] writes a page of a hundred points in one statement and the rest in the next; nothing for no points', async () => {
    const sql = database();
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    await index.upsert([]);
    expect(sql.calls).toEqual([]);
    await index.upsert(Array.from({ length: 250 }, (_, n) => point(n + 1)));
    const inserts = sql.calls.filter((call) => call.sql.startsWith('insert'));
    expect(inserts.map((call) => call.sql.split(ROW).length - 1)).toEqual([100, 100, 50]);
    expect(inserts.map((call) => call.params.length)).toEqual([900, 900, 450]);
    expect(inserts[2]?.params[0]).toBe(id(201));
  });

  it('[AGM-10] writes one row per id when a batch names an id twice, the later point winning', async () => {
    const sql = database();
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    await index.upsert([point(1, [1, 0, 0, 0]), point(2), point(1, [0, 1, 0, 0])]);
    const insert = sql.calls.at(-1);
    // Two rows: the statement splits around the row placeholder into three parts.
    expect(insert?.sql.split(ROW)).toHaveLength(3);
    expect(insert?.params).toHaveLength(18);
    expect(insert?.params[0]).toBe(id(1));
    expect(insert?.params[8]).toBe('[0,1,0,0]');
    expect(insert?.params[9]).toBe(id(2));
  });

  it('[AGM-10] removes by a list of ids bound as one uuid array; nothing for none', async () => {
    const sql = database();
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    await index.remove([]);
    expect(sql.calls).toEqual([]);
    await index.remove([id(1), id(2)]);
    expect(sql.calls.at(-1)).toEqual({
      sql: `delete from "${TABLE}" where id = any(?::uuid[])`,
      params: [`{"${id(1)}","${id(2)}"}`],
    });
  });

  it('[AGM-10] searches in one transaction, the scan settings first, the filter’s values between the vector’s two bindings, the limit last, and hands the hits back highest first with each score read as a number, whatever order the relaxed scan returned them in', async () => {
    const sql = database((statement) =>
      statement.startsWith('select id')
        ? [
            // As a relaxed-order scan may hand them back: the nearer row second, a tie after it.
            { id: id(2), score: 0.5 },
            { id: id(1), score: '0.75' },
            { id: id(3), score: 0.5 },
          ]
        : undefined,
    );
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    const hits = await index.search({
      vector: [1, 0, 0, 0],
      limit: 5,
      filter: request({ scope: { tenant: 't1', user: 'u1' }, where: { topic: 'x' } }),
    });
    expect(hits).toEqual([
      { id: id(1), score: 0.75 },
      { id: id(2), score: 0.5 },
      { id: id(3), score: 0.5 },
    ]);
    const transaction = sql.calls.slice(sql.calls.findIndex((call) => call.sql === 'BEGIN'));
    expect(transaction.map((call) => call.sql)).toEqual([
      'BEGIN',
      'set local hnsw.iterative_scan = relaxed_order',
      'set local hnsw.ef_search = 40',
      `select id, 1 - (embedding <=> ?::vector) as score from "${TABLE}" where ` +
        'space_id = ? and register = any(?::text[]) and partition = ? and ' +
        '((scope->>?) is null or scope->>? = ?) and (expires_at is null or expires_at > ?::timestamptz) ' +
        'and metadata->>? = ? order by embedding <=> ?::vector limit ?',
      'COMMIT',
    ]);
    expect(transaction[3]?.params).toEqual([
      '[1,0,0,0]',
      'space-1',
      '{"facts"}',
      't1',
      'user',
      'user',
      'u1',
      '2026-10-01T00:00:00.000Z',
      'topic',
      'x',
      '[1,0,0,0]',
      5,
    ]);
  });

  it('[AGM-10] keeps as many scan candidates as the search asks for, never below pgvector’s default nor above its ceiling', async () => {
    const sql = database();
    const index = new PgvectorVectorIndex(sql, { model: MODEL, dimensions: DIMENSIONS });
    const candidatesFor = async (limit: number): Promise<string | undefined> => {
      await index.search({ vector: [1, 0, 0, 0], limit, filter: request() });
      return sql.calls.find((call) => call.sql.startsWith('set local hnsw.ef_search'))?.sql;
    };
    expect(await candidatesFor(5)).toBe('set local hnsw.ef_search = 40');
    sql.calls.length = 0;
    expect(await candidatesFor(64)).toBe('set local hnsw.ef_search = 64');
    sql.calls.length = 0;
    expect(await candidatesFor(5000)).toBe('set local hnsw.ef_search = 1000');
  });
});
