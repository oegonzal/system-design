import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, mikroOrmExecutor, ormOptions } from '@sysdesign/db';
import { tableName, type SqlExecutor } from '@sysdesign/pgvector-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hitOf } from '../../../orchestrators/memory/testing';
import { storedChunkOf } from '../testing';
import { collectionName, pointId, toPayload } from './collection';
import { PgvectorMemoryStore, type ImportedPoint } from './pgvector-memory-store';

/**
 * The carry-over on the lane database: points as the Qdrant scroll hands
 * them over, written into the store's own table. The table stays, emptied of
 * this model's rows before and after (see the store spec for why).
 */
const model = 'spec-import';
const DIMENSIONS = 4;
const TABLE = `"${tableName(collectionName(model, DIMENSIONS))}"`;
/** What the scrolled points carried: a stamp from the store that held them before, kept as it was. */
const STORED_AT = '2026-10-13T03:55:42.884Z';

const chunk = (text: string, runId: string, ref: string) =>
  storedChunkOf({ ...hitOf(text, runId, ref), model }, DIMENSIONS);

/** A chunk as the scroll hands it over: at its id, its payload as stored, both vectors by name. */
const pointOf = (each: ReturnType<typeof chunk>): ImportedPoint => ({
  id: pointId(each.source.runId, each.source.ref),
  payload: toPayload(each, STORED_AT),
  vectors: each.vectors,
});

describe('the carry-over of points into the pgvector store', () => {
  let orm: MikroORM;
  let sql: SqlExecutor;
  let store: PgvectorMemoryStore;

  const clear = (): Promise<unknown> =>
    sql.run(`delete from ${TABLE} where payload->>'model' = ?`, [model]);

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    sql = mikroOrmExecutor(orm.em);
    store = new PgvectorMemoryStore(sql, model, DIMENSIONS);
    expect((await store.verify()).ready).toBe(true);
    await clear();
  }, 60_000);

  afterAll(async () => {
    await clear();
    await orm.close(true);
  });

  it('[QL-17] writes the points as they were scrolled — ids, payloads with their stamp, both vectors — searchable and retractable as the store’s own, and a second import replaces rather than doubles', async () => {
    const first = chunk('serve the list from a store the page owns', 'run-i1', 'memory.1');
    const second = chunk('record each status transition as a row', 'run-i1', 'memory.2');
    const points = [first, second].map(pointOf);
    expect(await store.importPoints(points)).toEqual({ imported: 2, refused: [] });
    expect((await store.verify()).chunks).toBe(2);

    // Found by the vector it came with, read back through the payload it came with.
    const [byCondition, byLesson] = await store.searchMany([
      { vector: first.vectors.condition, using: 'condition', limit: 5 },
      { vector: second.vectors.lesson, using: 'lesson', limit: 5 },
    ]);
    expect(byCondition[0]).toMatchObject({ text: first.text, source: first.source, model });
    expect(byCondition[0].score).toBeCloseTo(1, 5);
    expect(byLesson[0]).toMatchObject({ text: second.text, source: second.source });
    // The stamp is the one the point carried, not this import's clock.
    expect(
      await sql.one<{ stored_at: string }>(
        `select payload->>'storedAt' as stored_at from ${TABLE} where id = ?`,
        [points[0].id],
      ),
    ).toEqual({ stored_at: STORED_AT });

    expect(await store.importPoints(points)).toEqual({ imported: 2, refused: [] });
    expect((await store.verify()).chunks).toBe(2);
    expect(await store.retractPoint({ runId: 'run-i1', ref: 'memory.2' })).toMatchObject({
      status: 'removed',
      memory: { text: second.text },
    });
    expect(await store.retractRun('run-i1')).toBe(1);
    expect((await store.verify()).chunks).toBe(0);
  });

  it('[QL-17] refuses by name a point not at its own id, one whose payload this store does not write, and one whose vector is missing or not the store’s width, writes the rest, and under a dry run writes nothing', async () => {
    const good = pointOf(chunk('cache the listing by its filter key', 'run-i2', 'memory.1'));
    const elsewhere = pointOf(chunk('expire the cache on every write', 'run-i2', 'memory.2'));
    const wrongId = { ...elsewhere, id: pointId('run-i2', 'memory.9') };
    const later = pointOf(chunk('read the listing through one query', 'run-i2', 'memory.3'));
    const badPayload = { ...later, payload: { ...(later.payload as object), writtenLater: true } };
    const narrow = {
      ...pointOf(chunk('page the listing by its cursor', 'run-i2', 'memory.4')),
      vectors: { condition: [1, 0], lesson: good.vectors['lesson'] },
    };
    const missing = {
      ...pointOf(chunk('page the listing by its last key', 'run-i2', 'memory.5')),
      vectors: { condition: good.vectors['condition'] },
    };
    const points = [good, wrongId, badPayload, narrow, missing];

    const dry = await store.importPoints(points, { dryRun: true });
    expect(dry.imported).toBe(1);
    expect(dry.refused).toEqual([
      {
        id: wrongId.id,
        reason: `point ${wrongId.id} is not at the id its run and ref derive, ${elsewhere.id}`,
      },
      {
        id: later.id,
        reason: expect.stringMatching(
          /^point .* carries a payload this store does not write \(payload: .*writtenLater/,
        ),
      },
      {
        id: narrow.id,
        reason: `the condition vector of point ${narrow.id} has 2 dimensions, not the store's 4`,
      },
      { id: missing.id, reason: `point ${missing.id} carries no lesson vector` },
    ]);
    expect((await store.verify()).chunks).toBe(0);

    expect(await store.importPoints(points)).toEqual(dry);
    expect((await store.verify()).chunks).toBe(1);
    expect(await store.retractPoint({ runId: 'run-i2', ref: 'memory.1' })).toMatchObject({
      status: 'removed',
    });
  });
});
