import { tableName } from '@sysdesign/pgvector-kit';
import { recordingExecutor, type RecordedCall } from '@sysdesign/pgvector-kit/testing';
import { describe, expect, it } from 'vitest';

import type { MemoryProbe } from '../../../orchestrators/memory/ports';
import { hitOf } from '../../../orchestrators/memory/testing';
import { storedChunkOf } from '../testing';
import { collectionName, pointId, toPayload } from './collection';
import { PgvectorMemoryStore } from './pgvector-memory-store';

/**
 * The statements the store sends, read off a recorder: the live spec proves
 * what they do on a real table, this one that each is a single round trip
 * shaped as declared — one transaction around a search, batches of a hundred
 * rows, and never a `?` that is not a placeholder.
 */
const DIMENSIONS = 4;
const model = 'm';
const TABLE = `"${tableName(collectionName(model, DIMENSIONS))}"`;
const EXTENSION = "select 1 from pg_extension where extname = 'vector'";

const chunk = (text: string, runId: string, ref: string) =>
  storedChunkOf({ ...hitOf(text, runId, ref), model }, DIMENSIONS);

/** A database with the extension, over no connection; what it answers is the spec's. */
const database = (
  answer: (statement: string) => readonly unknown[] | undefined = () => undefined,
) => recordingExecutor((statement) => (statement === EXTENSION ? [{ one: 1 }] : answer(statement)));

/** The calls after the boot-time ensure: what one port call sent. */
const sent = (calls: readonly RecordedCall[]): RecordedCall[] =>
  calls.filter((call) => call.sql !== EXTENSION && !call.sql.startsWith('create '));

/** Every `?` in a statement is a placeholder, so their count is the number of values bound. */
const placeholders = (sql: string): number => (sql.match(/\?/g) ?? []).length;

const probe = (limit: number, filter?: MemoryProbe['filter']): MemoryProbe => ({
  vector: [1, 0, 0, 0],
  using: 'lesson',
  limit,
  ...(filter === undefined ? {} : { filter }),
});

describe('the statements the pgvector store sends', () => {
  it('[QL-17] [QL-41] searches every probe in one transaction: the scan widened to the largest fetch, one statement of per-probe selects joined by union all, each ordered by the distance the index is built on and fetching three times its limit', async () => {
    const sql = database(() => []);
    const store = new PgvectorMemoryStore(sql, model, DIMENSIONS);
    expect(await store.searchMany([])).toEqual([]);
    expect(sql.calls).toEqual([]);

    const answered = await store.searchMany([
      probe(16),
      probe(5, { kinds: ['profile_fact'], unitKey: 'U' }),
      { ...probe(3), using: 'condition', vector: [0, 1, 0, 0] },
    ]);
    expect(answered).toEqual([[], [], []]);
    const calls = sent(sql.calls);
    expect(calls.map((call) => call.sql.split(' (select')[0])).toEqual([
      'BEGIN',
      'set local hnsw.iterative_scan = relaxed_order',
      // 16 × 3 = 48: above the default of 40, so the scan reads enough before the filter.
      'set local hnsw.ef_search = 48',
      // Every search leaves out the memories bound to a unit unless it names one: the clause is there with no filter at all.
      '(select 0 as probe, id, payload, 1 - ("lesson" <=> ?::vector) as score from ' +
        `${TABLE} where NOT coalesce(payload->>'scope' = ANY(?::text[]), false) ` +
        'order by "lesson" <=> ?::vector limit 48) union all',
      'COMMIT',
    ]);
    const search = calls[3];
    expect(search.sql).toContain(
      `(select 1 as probe, id, payload, 1 - ("lesson" <=> ?::vector) as score from ${TABLE} ` +
        `where payload->>'kind' = ANY(?::text[]) AND NOT (coalesce(payload->>'scope' = ANY(?::text[]), false) ` +
        `AND (payload->>'unitKey') IS DISTINCT FROM ?) order by "lesson" <=> ?::vector limit 15)`,
    );
    expect(search.sql).toContain(
      `(select 2 as probe, id, payload, 1 - ("condition" <=> ?::vector) as score from ${TABLE} ` +
        `where NOT coalesce(payload->>'scope' = ANY(?::text[]), false) ` +
        `order by "condition" <=> ?::vector limit 9)`,
    );
    // Each branch binds its vector twice — once scored, once ordered by — around its filter's values.
    expect(search.params).toEqual([
      '[1,0,0,0]',
      '{"unit"}',
      '[1,0,0,0]',
      '[1,0,0,0]',
      '{"profile_fact"}',
      '{"unit"}',
      'U',
      '[1,0,0,0]',
      '[0,1,0,0]',
      '{"unit"}',
      '[0,1,0,0]',
    ]);
    expect(placeholders(search.sql)).toBe(search.params.length);

    // A small batch keeps the scan at its default; a huge one stays within what the server accepts.
    await store.searchMany([probe(2)]);
    await store.searchMany([probe(400)]);
    const widened = sent(sql.calls).filter((call) =>
      call.sql.startsWith('set local hnsw.ef_search'),
    );
    expect(widened.map((call) => call.sql)).toEqual([
      'set local hnsw.ef_search = 48',
      'set local hnsw.ef_search = 40',
      'set local hnsw.ef_search = 1000',
    ]);
  });

  it('[QL-17] regroups the rows by probe, re-sorts each by score, dedupes by content hash, cuts at the limit and passes an unreadable payload by', async () => {
    const a = chunk('serve the list from a store the page owns', 'run-a', 'memory.1');
    const b = chunk('record each status transition as a row', 'run-a', 'memory.2');
    const twin = chunk(a.text, 'run-b', 'memory.1');
    const row = (probeIndex: number, point: typeof a, score: number) => ({
      probe: probeIndex,
      id: pointId(point.source.runId, point.source.ref),
      payload: toPayload(point, '2026-11-11T00:00:00.000Z'),
      score,
    });
    const sql = database((statement) =>
      statement.startsWith('(select')
        ? [
            // Probe 1's rows come first and out of order; probe 0 has a twin and a row this build cannot read.
            row(1, b, 0.2),
            row(1, a, 0.9),
            row(0, a, 0.8),
            { probe: 0, id: 'x', payload: { not: 'a payload' }, score: 0.75 },
            row(0, twin, 0.7),
            row(0, b, 0.6),
          ]
        : [],
    );
    const store = new PgvectorMemoryStore(sql, model, DIMENSIONS);
    const [first, second] = await store.searchMany([probe(2), probe(5)]);
    expect(first.map((hit) => [hit.source.runId, hit.score])).toEqual([
      ['run-a', 0.8],
      ['run-a', 0.6],
    ]);
    expect(second.map((hit) => [hit.source.ref, hit.score])).toEqual([
      ['memory.1', 0.9],
      ['memory.2', 0.2],
    ]);
  });

  it('[QL-17] [QL-41] replaces a run in one transaction — a delete by run, narrowed to the kinds a writer owns, then upserts of a hundred rows per statement', async () => {
    const sql = database();
    const store = new PgvectorMemoryStore(
      sql,
      model,
      DIMENSIONS,
      () => new Date('2026-11-11T12:00:00Z'),
    );
    const chunks = Array.from({ length: 150 }, (_, index) =>
      chunk(`lesson ${index}`, 'run-a', `memory.${index + 1}`),
    );
    expect(await store.replaceRunChunks('run-a', chunks)).toBe(150);
    const calls = sent(sql.calls);
    expect(calls.map((call) => call.sql.split(' ').slice(0, 2).join(' '))).toEqual([
      'BEGIN',
      'delete from',
      'insert into',
      'insert into',
      'COMMIT',
    ]);
    expect(calls[1]).toEqual({
      sql: `delete from ${TABLE} where payload->>'runId' = ?`,
      params: ['run-a'],
    });
    const [first, second] = [calls[2], calls[3]];
    expect(first.sql).toMatch(
      new RegExp(
        `^insert into ${TABLE} \\("id", "payload", "condition", "lesson"\\) values \\(\\?, \\?::jsonb, \\?::vector, \\?::vector\\)(, \\(\\?, \\?::jsonb, \\?::vector, \\?::vector\\)){99} on conflict \\(id\\) do update set "payload" = excluded."payload", "condition" = excluded."condition", "lesson" = excluded."lesson"$`,
      ),
    );
    expect(first.params).toHaveLength(400);
    expect(second.params).toHaveLength(200);
    expect(placeholders(first.sql)).toBe(400);
    expect(placeholders(second.sql)).toBe(200);
    // The first row: its id, its payload stamped with the clock, both vectors as literals.
    expect(first.params.slice(0, 4)).toEqual([
      pointId('run-a', 'memory.1'),
      JSON.stringify(toPayload(chunks[0], '2026-11-11T12:00:00.000Z')),
      `[${chunks[0].vectors.condition.join(',')}]`,
      `[${chunks[0].vectors.lesson.join(',')}]`,
    ]);

    // A scoped replace deletes only the kinds the writer owns; an empty replace writes nothing.
    expect(await store.replaceRunChunks('run-a', [], { kinds: ['lesson', 'fact'] })).toBe(0);
    expect(sent(sql.calls).slice(5)).toEqual([
      { sql: 'BEGIN', params: [] },
      {
        sql: `delete from ${TABLE} where payload->>'runId' = ? and payload->>'kind' = ANY(?::text[])`,
        params: ['run-a', '{"lesson","fact"}'],
      },
      { sql: 'COMMIT', params: [] },
    ]);
  });

  it('[QL-17] writes one row per id when a replace names a ref twice, the later chunk winning, and counts what it wrote', async () => {
    const sql = database();
    const store = new PgvectorMemoryStore(sql, model, DIMENSIONS);
    const first = chunk('serve the list from a store the page owns', 'run-d', 'memory.1');
    const again = chunk('serve the list from a store the page owns, cached', 'run-d', 'memory.1');
    const other = chunk('record each status transition as a row', 'run-d', 'memory.2');
    expect(await store.replaceRunChunks('run-d', [first, other, again])).toBe(2);
    const insert = sent(sql.calls)[2];
    // Two rows: one per id, the later chunk at the first's place; a third would have been refused by the database.
    expect(insert.sql.split('?::jsonb')).toHaveLength(3);
    expect(insert.params).toHaveLength(8);
    expect(insert.params[0]).toBe(pointId('run-d', 'memory.1'));
    expect(insert.params[1]).toContain(again.text);
    expect(insert.params[4]).toBe(pointId('run-d', 'memory.2'));
  });

  it('[QL-70] [QL-41] retracts a run by one delete, a point by a read then a delete at its id, and sets support by one merge per point', async () => {
    const held = chunk('page the listing by its cursor', 'run-u1', 'memory.1');
    const id = pointId('run-u1', 'memory.1');
    const sql = database((statement) =>
      statement.startsWith('select payload')
        ? [{ payload: toPayload(held, '2026-11-11T00:00:00.000Z') }]
        : statement.startsWith('delete')
          ? [{}, {}]
          : [],
    );
    const store = new PgvectorMemoryStore(sql, model, DIMENSIONS);
    expect(await store.retractRun('run-u1')).toBe(2);
    expect(sent(sql.calls)).toEqual([
      { sql: `delete from ${TABLE} where payload->>'runId' = ?`, params: ['run-u1'] },
    ]);

    const removed = await store.retractPoint({ runId: 'run-u1', ref: 'memory.1' });
    expect(removed).toMatchObject({ status: 'removed', memory: { text: held.text } });
    expect(sent(sql.calls).slice(1)).toEqual([
      { sql: `select payload from ${TABLE} where id = ?`, params: [id] },
      { sql: `delete from ${TABLE} where id = ?`, params: [id] },
    ]);

    await store.setSupport([
      { point: { runId: 'run-u1', ref: 'memory.1' }, support: { confirms: 2, contradicts: 1 } },
      { point: { runId: 'run-u1', ref: 'memory.2' }, support: { confirms: 0, contradicts: 0 } },
    ]);
    expect(sent(sql.calls).slice(3)).toEqual([
      {
        sql:
          `update ${TABLE} set payload = payload || jsonb_build_object('support', ?::jsonb) ` +
          `where payload->>'runId' = ? and payload->>'ref' = ?`,
        params: ['{"confirms":2,"contradicts":1}', 'run-u1', 'memory.1'],
      },
      {
        sql:
          `update ${TABLE} set payload = payload || jsonb_build_object('support', ?::jsonb) ` +
          `where payload->>'runId' = ? and payload->>'ref' = ?`,
        params: ['{"confirms":0,"contradicts":0}', 'run-u1', 'memory.2'],
      },
    ]);
    for (const call of sent(sql.calls)) expect(placeholders(call.sql)).toBe(call.params.length);
  });
});
