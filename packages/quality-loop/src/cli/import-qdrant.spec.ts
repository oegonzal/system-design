import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ensureDatabase, mikroOrmExecutor, ormOptions } from '@sysdesign/db';
import { tableName, type SqlExecutor } from '@sysdesign/pgvector-kit';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectionName, pointId, toPayload } from '../modules/memory/pgvector/collection';
import { PgvectorMemoryStore } from '../modules/memory/pgvector/pgvector-memory-store';
import { storedChunkOf } from '../modules/memory/testing';
import { hitOf } from '../orchestrators/memory/testing';
import { importQdrantCli } from './import-qdrant';

/**
 * The command end to end on the lane database, against a Qdrant of the
 * spec's own: one collection, every point in one page, served over
 * `node:http` as `points/scroll` answers it. Each run boots the command's own
 * Nest context, as `main.js import-qdrant` does. The table the real runs fill
 * is emptied of this model's rows before and after (only a migration or a
 * guarded door may drop a table); the dry run names a table of this run's
 * own, so that it was never made is proven on a fresh name every time.
 */
const DIMENSIONS = 4;
const MODEL = 'spec-cli';
const COLLECTION = collectionName(MODEL, DIMENSIONS);
const TABLE = `"${tableName(COLLECTION)}"`;
/** What the scrolled points carry: a stamp from the store that held them before, kept as it was. */
const STORED_AT = '2026-10-13T03:55:42.884Z';
const EACH_RUN = 60_000;

const chunk = (text: string, runId: string, ref: string, model = MODEL) =>
  storedChunkOf({ ...hitOf(text, runId, ref), model }, DIMENSIONS);

/** A point as Qdrant scrolls it: its id, its payload, its vectors by name. */
const scrolled = (each: ReturnType<typeof chunk>) => ({
  id: pointId(each.source.runId, each.source.ref),
  payload: toPayload(each, STORED_AT),
  vector: each.vectors,
});

type Scrolled = ReturnType<typeof scrolled> | { id: string; payload: unknown; vector: unknown };

/** A Qdrant over no store, serving one collection's points in one page; anything else is 404. */
async function qdrantOf(
  collection: string,
  points: readonly Scrolled[],
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    request.resume();
    const scroll =
      request.method === 'POST' &&
      request.url === `/collections/${encodeURIComponent(collection)}/points/scroll`;
    response.writeHead(scroll ? 200 : 404, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        scroll
          ? { result: { points, next_page_offset: null } }
          : { status: { error: 'Not found' } },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('the spec qdrant has no port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      ),
  };
}

describe('the import-qdrant command', () => {
  let orm: MikroORM;
  let sql: SqlExecutor;
  let logs: string[];
  let errors: string[];

  const clear = (): Promise<unknown> =>
    sql.run(`delete from ${TABLE} where payload->>'model' = ?`, [MODEL]);
  const held = async (): Promise<number> =>
    (
      await sql.one<{ n: number }>(
        `select count(*)::int as n from ${TABLE} where payload->>'model' = ?`,
        [MODEL],
      )
    )?.n ?? 0;

  beforeAll(async () => {
    await ensureDatabase();
    orm = await MikroORM.init({ driver: PostgreSqlDriver, ...ormOptions });
    sql = mikroOrmExecutor(orm.em);
    // The table exists once the store has verified; then it is emptied of any earlier run's rows.
    expect((await new PgvectorMemoryStore(sql, MODEL, DIMENSIONS).verify()).ready).toBe(true);
    await clear();
  }, EACH_RUN);

  afterAll(async () => {
    await clear();
    await orm.close(true);
  });

  beforeEach(() => {
    logs = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      logs.push(parts.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
      errors.push(parts.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('[QL-86] answers a flag it does not know, or a --from that is not a URL, with the usage line and exit 2 before anything boots', async () => {
    expect(await importQdrantCli(['--colection', COLLECTION])).toBe(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^usage: import-qdrant \[--from <url>\] \[--collection <name>\] \[--dry-run\] \[--force\]\n.*--colection/,
    );
    expect(await importQdrantCli(['--from', 'not a url', '--collection', COLLECTION])).toBe(2);
    expect(errors[1]).toContain('--from not a url is not a URL');
    expect(logs).toEqual([]);
  });

  it(
    '[QL-86] a dry run checks every point and writes nothing, not even the table: an absent table is read as holding nothing, never made',
    async () => {
      const dryModel = `spec-cli-dry-${randomUUID().slice(0, 8)}`;
      const dryCollection = collectionName(dryModel, DIMENSIONS);
      const dryTable = tableName(dryCollection);
      const good = chunk(
        'serve the list from a store the page owns',
        'run-c1',
        'memory.1',
        dryModel,
      );
      const narrow = {
        ...scrolled(chunk('page the listing by its cursor', 'run-c1', 'memory.2', dryModel)),
        vector: { condition: [1, 0], lesson: good.vectors.lesson },
      };
      const qdrant = await qdrantOf(dryCollection, [scrolled(good), narrow]);
      try {
        expect(
          await importQdrantCli(['--dry-run', '--from', qdrant.url, '--collection', dryCollection]),
        ).toBe(0);
      } finally {
        await qdrant.close();
      }
      expect(logs[0]).toBe(
        `memory store: ${dryCollection} (table absent, 0 chunks before) — dry run, nothing is written, not even the table`,
      );
      expect(logs[1]).toMatch(/^scanned 2 imported 1 refused 1 in \d+\.\d s$/);
      expect(logs[2]).toMatch(/^first refusal: the condition vector of point .* has 2 dimensions/);
      expect(errors).toEqual([]);
      expect(
        await sql.one<{ made: boolean }>('select to_regclass(?) is not null as made', [
          `"${dryTable}"`,
        ]),
      ).toEqual({ made: false });
    },
    EACH_RUN,
  );

  it(
    '[QL-86] writes into a table holding nothing, refuses one that already holds chunks — dry or not — and writes over it under --force',
    async () => {
      const points = [
        chunk('serve the list from a store the page owns', 'run-c2', 'memory.1'),
        chunk('record each status transition as a row', 'run-c2', 'memory.2'),
      ].map(scrolled);
      const qdrant = await qdrantOf(COLLECTION, points);
      const run = (...flags: string[]): Promise<number> =>
        importQdrantCli([...flags, '--from', qdrant.url, '--collection', COLLECTION]);
      try {
        expect(await run()).toBe(0);
        expect(logs).toEqual([
          `memory store: ${COLLECTION} (0 chunks before)`,
          expect.stringMatching(/^scanned 2 imported 2 refused 0 in /),
          `memory store: ${COLLECTION} (2 chunks after)`,
        ]);
        expect(await held()).toBe(2);

        expect(await run()).toBe(1);
        expect(errors.at(-1)).toContain(`memory store: ${COLLECTION} already holds 2 chunks`);
        expect(errors.at(-1)).toContain('Pass --force');
        expect(await run('--dry-run')).toBe(1);
        expect(logs.at(-1)).toBe(
          `memory store: ${COLLECTION} (2 chunks before) — dry run, nothing is written, not even the table`,
        );
        expect(await held()).toBe(2);

        expect(await run('--force')).toBe(0);
        expect(logs.at(-1)).toBe(`memory store: ${COLLECTION} (2 chunks after)`);
        expect(await held()).toBe(2);
      } finally {
        await qdrant.close();
      }
    },
    EACH_RUN,
  );
});
