import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import type { SqlExecutor } from '@sysdesign/pgvector-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migratorSettings } from './migrator';
import { ormOptions } from './orm.options';
import { mikroOrmExecutor } from './sql-executor';
import { ensureDatabase } from './testing/ensure-database';

/**
 * The executor on the lane database: the vector extension the migration
 * installed, every placeholder kind a memory store binds, the rows a statement
 * reports, the Postgres code a driver error keeps, and a transaction's
 * promises — committed, rolled back, one connection, a savepoint when nested.
 *
 * The probe table is a runtime `vec_` table like a store's, made with
 * `create table if not exists` and left standing: its rows are removed by run
 * tag afterwards, and the table itself stays because only a migration or a
 * guarded door may spell the statement that removes a table
 * (tooling/test-database-guarantees.spec.ts). A lane that holds it is
 * exactly what `[DB-2]` says the schema check must tolerate.
 */
const WORKSPACE_ROOT = join(__dirname, '..', '..', '..');

/** Three-wide, so a vector reads whole in an assertion and a cosine is exact. */
const TABLE = '"vec_spec_probe"';

/** This run's rows: a run removes its own and never another's. */
const RUN = randomUUID();

interface Probe {
  id: string;
  tag: string;
  vector: readonly number[];
}

const probe = (tag: string, vector: readonly number[]): Probe => ({
  id: randomUUID(),
  tag,
  vector,
});

/** One row, bound the way a store binds: the id as text, the payload as `?::jsonb`, the vector as its `[…]` literal. */
const insert = (sql: SqlExecutor, row: Probe) =>
  sql.run(`insert into ${TABLE} (id, payload, v) values (?, ?::jsonb, ?::vector)`, [
    row.id,
    JSON.stringify({ run: RUN, tag: row.tag }),
    `[${row.vector.join(',')}]`,
  ]);

const tagOf = (sql: SqlExecutor, id: string) =>
  sql.one<{ tag: string }>(`select payload->>'tag' as tag from ${TABLE} where id = ?`, [id]);

const backendPid = (sql: SqlExecutor) => sql.one<{ pid: number }>('select pg_backend_pid() as pid');

let orm: MikroORM;
let sql: SqlExecutor;

beforeAll(async () => {
  await ensureDatabase();
  // The migrator is here for `[DB-2]`: `checkSchema()` is what `migration:check` runs.
  orm = await MikroORM.init({
    ...ormOptions,
    extensions: [Migrator],
    migrations: migratorSettings(WORKSPACE_ROOT),
  });
  sql = mikroOrmExecutor(orm.em);
  await sql.run(
    `create table if not exists ${TABLE} (id uuid primary key, payload jsonb, v vector(3))`,
  );
}, 60_000);

afterAll(async () => {
  await sql.run(`delete from ${TABLE} where payload->>'run' = ?`, [RUN]);
  await orm.close(true);
});

describe('the vector extension', () => {
  it('[DB-2] is installed by the migration, at the version Aurora 16.10, the compose image and CI all ship', async () => {
    const row = await sql.one<{ extversion: string }>(
      'select extversion from pg_extension where extname = ?',
      ['vector'],
    );
    expect(row).toEqual({ extversion: '0.8.0' });
  });
});

describe('the executor', () => {
  it('[DB-1] binds a string, a text[] literal, jsonb and a vector through ? placeholders, and reports the rows a statement touched', async () => {
    const alpha = probe('alpha', [1, 0, 0]);
    const beta = probe('beta', [0, 1, 0]);
    expect(await insert(sql, alpha)).toEqual({ affectedRows: 1 });
    expect(await insert(sql, beta)).toEqual({ affectedRows: 1 });

    // The same vector scores 1, the orthogonal one 0: `1 - (v <=> q)` is the cosine score.
    const scored = await sql.all<{ tag: string; score: number }>(
      `select payload->>'tag' as tag, 1 - (v <=> ?::vector) as score from ${TABLE} ` +
        `where payload @> ?::jsonb and payload->>'tag' = any(?::text[]) order by score desc`,
      ['[1,0,0]', JSON.stringify({ run: RUN }), '{"alpha","beta","gamma"}'],
    );
    expect(scored).toEqual([
      { tag: 'alpha', score: 1 },
      { tag: 'beta', score: 0 },
    ]);

    // `one` is the first row or nothing; a `?` inside a value stays a value, a `\?` in the statement is a literal.
    expect(await tagOf(sql, randomUUID())).toBeUndefined();
    expect(await sql.one<{ q: string; l: string }>(`select ? as q, 'a\\?b' as l`, ['x?y'])).toEqual(
      { q: 'x?y', l: 'a?b' },
    );

    const removed = await sql.run(`delete from ${TABLE} where id = any(?::uuid[])`, [
      `{"${alpha.id}","${beta.id}"}`,
    ]);
    expect(removed).toEqual({ affectedRows: 2 });
  });

  it('[DB-1] hands a driver error on as raised, with its Postgres code', async () => {
    const twice = probe('twice', [0, 0, 1]);
    await insert(sql, twice);
    await expect(insert(sql, twice)).rejects.toMatchObject({ code: '23505' });
    await expect(sql.run(`create table ${TABLE} (id uuid primary key)`)).rejects.toMatchObject({
      code: '42P07',
    });
  });

  it('[DB-1] commits what the transaction callback did, and returns what it returned', async () => {
    const row = probe('committed', [1, 1, 0]);
    const returned = await sql.transaction(async (tx) => {
      await insert(tx, row);
      return 'done';
    });
    expect(returned).toBe('done');
    expect(await tagOf(sql, row.id)).toEqual({ tag: 'committed' });
  });

  it('[DB-1] leaves no row when the transaction callback throws', async () => {
    const row = probe('rolled back', [0, 1, 1]);
    await expect(
      sql.transaction(async (tx) => {
        await insert(tx, row);
        throw new Error('refused on purpose');
      }),
    ).rejects.toThrow('refused on purpose');
    expect(await tagOf(sql, row.id)).toBeUndefined();
  });

  it('[DB-1] runs a nested call on the transaction’s own connection, where it sees the uncommitted row a detached connection cannot', async () => {
    const row = probe('pending', [1, 0, 1]);
    // A manager forked outside the transaction never joins it: its executor is the witness on another connection.
    const detached = mikroOrmExecutor(orm.em.fork());
    await sql.transaction(async (tx) => {
      const inside = await backendPid(tx);
      await insert(tx, row);
      expect(await tagOf(tx, row.id)).toEqual({ tag: 'pending' });
      expect(await backendPid(tx)).toEqual(inside);
      // The transaction context is async-scoped: the executor over the ORM's
      // global manager, called from inside the callback, runs on the
      // transaction too — it resolves the transaction's fork, not the pool.
      expect(await tagOf(sql, row.id)).toEqual({ tag: 'pending' });
      expect(await backendPid(sql)).toEqual(inside);
      // Nothing is committed to the detached connection yet.
      expect(await tagOf(detached, row.id)).toBeUndefined();
      expect(await backendPid(detached)).not.toEqual(inside);
    });
    expect(await tagOf(detached, row.id)).toEqual({ tag: 'pending' });
  });

  it('[DB-1] holds a transaction opened inside another as a savepoint: its throw undoes its rows alone', async () => {
    const kept = probe('kept', [1, 1, 1]);
    const undone = probe('undone', [0, 0, 1]);
    await sql.transaction(async (tx) => {
      await insert(tx, kept);
      await expect(
        tx.transaction(async (inner) => {
          await insert(inner, undone);
          throw new Error('inner refused');
        }),
      ).rejects.toThrow('inner refused');
      // The outer transaction is still usable after the savepoint rolled back.
      expect(await tagOf(tx, kept.id)).toEqual({ tag: 'kept' });
    });
    const tags = await sql.all<{ tag: string }>(
      `select payload->>'tag' as tag from ${TABLE} where id = any(?::uuid[]) order by tag`,
      [`{"${kept.id}","${undone.id}"}`],
    );
    expect(tags).toEqual([{ tag: 'kept' }]);
  });
});

describe('the schema check', () => {
  it('[DB-2] reads a runtime vec_ table as no drift, and proposes dropping it only without the skip', async () => {
    expect(await orm.migrator.checkSchema()).toBe(false);

    const unguarded = await MikroORM.init({
      ...ormOptions,
      schemaGenerator: { skipTables: [] },
      extensions: [Migrator],
      migrations: migratorSettings(WORKSPACE_ROOT),
    });
    try {
      expect(await unguarded.migrator.checkSchema()).toBe(true);
      expect(await unguarded.schema.getUpdateSchemaSQL({ wrap: false })).toMatch(
        /^drop table .*vec_spec_probe/m,
      );
    } finally {
      await unguarded.close(true);
    }
  });
});
