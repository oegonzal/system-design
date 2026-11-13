import { tableName } from '@sysdesign/pgvector-kit';
import { recordingExecutor, type RecordedCall } from '@sysdesign/pgvector-kit/testing';
import { describe, expect, it } from 'vitest';

import { collectionName, INDEXED_FIELDS, schemaFor } from './collection';
import { PgvectorMemoryStore } from './pgvector-memory-store';

const DIMENSIONS = 4;
const COLLECTION = collectionName('m', DIMENSIONS);
const TABLE = tableName(COLLECTION);
/** The extension check the kit runs first, answered with a row where the extension is installed. */
const EXTENSION = "select 1 from pg_extension where extname = 'vector'";
const COUNT = `select count(*)::int as chunks from "${TABLE}"`;

/** Every `create …` the store ran, in order. */
const creates = (calls: readonly RecordedCall[]): string[] =>
  calls.filter((call) => call.sql.startsWith('create ')).map((call) => call.sql);

/** A database with the extension and `chunks` rows in the table, over no connection. */
const database = (chunks: number) =>
  recordingExecutor((statement) => {
    if (statement === EXTENSION) return [{ one: 1 }];
    if (statement === COUNT) return [{ chunks }];
    return undefined;
  });

describe('the pgvector store’s schema at boot', () => {
  it('[QL-17] [QL-41] makes sure of the table and every declared index after the extension check and before it counts, once per process', async () => {
    const sql = database(0);
    const store = new PgvectorMemoryStore(sql, 'm', DIMENSIONS);
    expect(await store.verify()).toEqual({
      ready: true,
      reason: null,
      note: null,
      model: 'm',
      collection: COLLECTION,
      chunks: 0,
    });
    expect(sql.calls.map((call) => call.sql)).toEqual([
      EXTENSION,
      ...schemaFor(TABLE, DIMENSIONS),
      COUNT,
    ]);
    // The table, one index per filtered field, one per named vector.
    expect(creates(sql.calls)).toHaveLength(1 + INDEXED_FIELDS.length + 2);
    // A second call counts without ensuring again.
    expect((await store.verify()).chunks).toBe(0);
    expect(creates(sql.calls)).toHaveLength(1 + INDEXED_FIELDS.length + 2);
    expect(sql.calls.filter((call) => call.sql === COUNT)).toHaveLength(2);
  });

  it('[QL-17] [QL-41] shares one ensure between two first calls at once, so the list runs once however the boot and an early run race', async () => {
    const sql = database(2);
    const store = new PgvectorMemoryStore(sql, 'm', DIMENSIONS);
    const [first, second] = await Promise.all([store.verify(), store.verify()]);
    expect([first.chunks, second.chunks]).toEqual([2, 2]);
    expect(sql.calls.filter((call) => call.sql === EXTENSION)).toHaveLength(1);
    expect(creates(sql.calls)).toHaveLength(1 + INDEXED_FIELDS.length + 2);
    expect(sql.calls.filter((call) => call.sql === COUNT)).toHaveLength(2);
  });

  it('[QL-41] runs the list once more when another process won a create at the same moment, and stays usable', async () => {
    let tables = 0;
    const sql = recordingExecutor((statement) => {
      if (statement === EXTENSION) return [{ one: 1 }];
      if (statement === COUNT) return [{ chunks: 3 }];
      if (statement.startsWith('create table') && tables++ === 0) {
        throw Object.assign(new Error('relation already exists'), { code: '42P07' });
      }
      return undefined;
    });
    expect((await new PgvectorMemoryStore(sql, 'm', DIMENSIONS).verify()).chunks).toBe(3);
    expect(sql.calls.filter((call) => call.sql.startsWith('create table'))).toHaveLength(2);
    // The lost create, then the whole list from the start.
    expect(creates(sql.calls)).toHaveLength(1 + (1 + INDEXED_FIELDS.length + 2));
  });

  it('[QL-17] reports a database without the extension as unreachable, naming the migration, and looks again on the next call', async () => {
    // The extension check answers no row: the migration has not run here.
    const sql = recordingExecutor(() => undefined);
    const store = new PgvectorMemoryStore(sql, 'm', DIMENSIONS);
    const missing = await store.verify();
    expect(missing).toMatchObject({
      ready: false,
      reason: 'unreachable',
      model: 'm',
      collection: COLLECTION,
      chunks: 0,
    });
    expect(missing.note).toMatch(/vector extension is not installed/);
    expect(missing.note).toMatch(/pnpm db:migrate/);
    expect(sql.calls.map((call) => call.sql)).toEqual([EXTENSION]);
    // Nothing was memoised by the failure: the next call checks again.
    await store.verify();
    expect(sql.calls.map((call) => call.sql)).toEqual([EXTENSION, EXTENSION]);
  });

  it('[QL-17] reports a database that refuses as unreachable with its words, and a write then fails rather than pretending', async () => {
    const sql = recordingExecutor(() => {
      throw new Error('connection refused');
    });
    const store = new PgvectorMemoryStore(sql, 'm', DIMENSIONS);
    expect(await store.verify()).toEqual({
      ready: false,
      reason: 'unreachable',
      note: 'connection refused',
      model: 'm',
      collection: COLLECTION,
      chunks: 0,
    });
    await expect(store.retractRun('run-a')).rejects.toThrow('connection refused');
  });

  it('[QL-17] binds nothing without a model: no statement runs, and a search refuses by name', async () => {
    const sql = recordingExecutor();
    const store = new PgvectorMemoryStore(sql, null, DIMENSIONS);
    expect(await store.verify()).toEqual({
      ready: false,
      reason: 'no-model',
      note: null,
      model: null,
      collection: null,
      chunks: 0,
    });
    await expect(
      store.searchMany([{ vector: [1, 0, 0, 0], using: 'lesson', limit: 1 }]),
    ).rejects.toThrow('no embedding model');
    expect(sql.calls).toEqual([]);
  });
});
