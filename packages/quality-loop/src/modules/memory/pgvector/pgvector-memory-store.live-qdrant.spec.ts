import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, mikroOrmExecutor, ormOptions } from '@sysdesign/db';
import { tableName, vectorLiteral, type SqlExecutor } from '@sysdesign/pgvector-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { collectionName, pointId } from './collection';
import { PgvectorMemoryStore } from './pgvector-memory-store';

/**
 * The carried-over collection answers as the Qdrant it came from. Run by
 * hand, after `main.js import-qdrant` filled the lane database's table, with
 * `QDRANT_URL` naming the old server — which is read only: one scroll of one
 * point and two queries. Skipped without it, since neither a test run nor CI
 * has a Qdrant any more. One scrolled point's `condition` vector is asked of
 * both stores: the nearest five by the raw distance must agree on ids and
 * scores to four decimals (the point itself first, scoring 1), and the
 * adapter's own search — unit-bound memories left out, duplicates folded —
 * must agree with Qdrant asked the same way.
 */
const QDRANT_URL = process.env['QDRANT_URL'];
const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536;
const COLLECTION = collectionName(MODEL, DIMENSIONS);
const TABLE = `"${tableName(COLLECTION)}"`;
const TOP = 5;
/** The adapter over-fetches by this before folding duplicates; Qdrant is asked for as many so both fold the same list. */
const DEDUPE_FACTOR = 3;

const scrolledSchema = z.object({
  result: z.object({
    points: z.array(
      z.object({ id: z.string(), vector: z.object({ condition: z.array(z.number()) }) }),
    ),
  }),
});

const queriedSchema = z.object({
  result: z.object({
    points: z.array(
      z.object({
        id: z.string(),
        score: z.number(),
        payload: z.object({ contentHash: z.string() }).nullable().optional(),
      }),
    ),
  }),
});

const post = async (path: string, body: unknown): Promise<unknown> => {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.ok, `qdrant answered ${response.status}`).toBe(true);
  return response.json();
};

const fourDecimals = (score: number): string => score.toFixed(4);

describe.skipIf(QDRANT_URL === undefined)('the carried-over collection beside its Qdrant', () => {
  let orm: MikroORM;
  let sql: SqlExecutor;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    sql = mikroOrmExecutor(orm.em);
  }, 60_000);

  afterAll(async () => {
    await orm.close(true);
  });

  it('[QL-17] ranks the nearest points to a scrolled vector as Qdrant does, by id and by score to four decimals, raw and through the adapter', async () => {
    const scrolled = scrolledSchema.parse(
      await post('scroll', { limit: 1, with_payload: false, with_vector: ['condition'] }),
    );
    const [point] = scrolled.result.points;
    expect(point).toBeDefined();
    const vector = point.vector.condition;
    expect(vector).toHaveLength(DIMENSIONS);

    // Raw: the five nearest by cosine, no filter, no folding.
    const qdrantRaw = queriedSchema.parse(
      await post('query', { query: vector, using: 'condition', limit: TOP, with_payload: false }),
    ).result.points;
    const literal = vectorLiteral(vector);
    const pgRaw = await sql.all<{ id: string; score: number }>(
      `select id, 1 - ("condition" <=> ?::vector) as score from ${TABLE} ` +
        `order by "condition" <=> ?::vector limit ${TOP}`,
      [literal, literal],
    );
    const shown = (rows: readonly { id: string; score: number }[]) =>
      rows.map((row) => [row.id, fourDecimals(row.score)]);
    console.log(`qdrant raw top ${TOP}: ${JSON.stringify(shown(qdrantRaw))}`);
    console.log(`pgvector raw top ${TOP}: ${JSON.stringify(shown(pgRaw))}`);
    expect(pgRaw[0].id).toBe(point.id);
    expect(pgRaw[0].score).toBeCloseTo(1, 4);
    expect(shown(pgRaw)).toEqual(shown(qdrantRaw));

    // Through the adapter: every memory bound to a unit left out, duplicates folded by content hash.
    const store = new PgvectorMemoryStore(sql, MODEL, DIMENSIONS);
    const [hits] = await store.searchMany([{ vector, using: 'condition', limit: TOP }]);
    const qdrantFiltered = queriedSchema.parse(
      await post('query', {
        query: vector,
        using: 'condition',
        limit: TOP * DEDUPE_FACTOR,
        with_payload: ['contentHash'],
        filter: { must_not: [{ key: 'scope', match: { any: ['unit'] } }] },
      }),
    ).result.points;
    const seen = new Set<string>();
    const qdrantFolded = qdrantFiltered
      .filter((each) => {
        const hash = each.payload?.contentHash ?? each.id;
        if (seen.has(hash)) return false;
        seen.add(hash);
        return true;
      })
      .slice(0, TOP);
    const adapted = hits.map((hit) => [
      pointId(hit.source.runId, hit.source.ref),
      fourDecimals(hit.score),
    ]);
    console.log(`qdrant adapter-shaped top ${TOP}: ${JSON.stringify(shown(qdrantFolded))}`);
    console.log(`pgvector adapter top ${TOP}: ${JSON.stringify(adapted)}`);
    expect(adapted).toEqual(shown(qdrantFolded));
  });
});
