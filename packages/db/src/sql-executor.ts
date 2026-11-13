/**
 * Raw SQL over a MikroORM entity manager, as the `SqlExecutor` the pgvector
 * kit's stores run on. MikroORM has no vector column type, so the memory tier
 * writes its own statements, and this is the one place they meet the ORM's
 * connection — the same raw path `migrator.ts` reads the migrations table by.
 *
 * Every placeholder is formatted on the client by the platform before the
 * statement is sent (`?` a quoted value, `??` an identifier, `\?` a literal
 * `?`); nothing travels as a driver parameter. So a value is bound as the text
 * the database parses, cast on its placeholder: a Postgres array as
 * `'{"a","b"}'` with `?::text[]` (a JS array would be rendered as a bare comma
 * list), a vector as `'[0.1,…]'` with `?::vector`, JSON as a string with
 * `?::jsonb`. A driver error reaches the caller as node-postgres raised it,
 * its SQLSTATE in `code`. Inside `transaction` every call runs on the
 * transaction's connection: the forked manager carries the context, and a
 * `transaction` opened inside another is a savepoint.
 */
import type { QueryResult } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { SqlExecutor } from '@sysdesign/pgvector-kit';

// `execute` types its rows as entity data, which a raw row is not: the rows
// are whatever the caller's statement selects, so the executor's `T` is the
// caller's claim, asserted here once.
export const mikroOrmExecutor = (em: EntityManager): SqlExecutor => ({
  all: async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> =>
    (await em.getConnection().execute(sql, [...params], 'all', em.getTransactionContext())) as T[],
  one: async <T>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> =>
    (await em.getConnection().execute(sql, [...params], 'get', em.getTransactionContext())) as
      T | undefined,
  run: async (sql, params = []) => {
    const result: QueryResult = await em
      .getConnection()
      .execute(sql, [...params], 'run', em.getTransactionContext());
    return { affectedRows: result.affectedRows };
  },
  transaction: (fn) => em.transactional((tem) => fn(mikroOrmExecutor(tem))),
});
