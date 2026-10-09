import { join } from 'node:path';

import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';

import { connectionSettings } from '../connection';
import { migratorSettings } from '../migrator';
import { ormOptions } from '../orm.options';
import { assertTestDatabase } from './test-database';

/**
 * Test support: make the configured database exist and be migrated — and
 * refuse, before connecting anywhere, unless it is a test database. Every
 * suite that touches Postgres calls this first, so one pointed at someone's
 * data (a `DB_NAME` from CI, a shell, or the `.env` Nx loads) stops at boot
 * with the database named, before a single row is written or truncated.
 * Creating is a one-time race the duplicate-database error absorbs;
 * migrating is the same idempotent `migration:up` the CLI runs.
 *
 * The guard runs on every call; the work is memoised per process — every
 * harness calls it, only the first one pays.
 */
let ensured: Promise<void> | null = null;

export async function ensureDatabase(): Promise<void> {
  // Read the environment at call time: `ormOptions` snapshots it at import,
  // and the maintenance connection must not depend on module load order.
  const connection = connectionSettings(process.env);
  assertTestDatabase(connection.dbName, 'prepare');
  ensured ??= createAndMigrate(connection);
  return ensured;
}

async function createAndMigrate(connection: ReturnType<typeof connectionSettings>): Promise<void> {
  const { host, port, user, password, dbName } = connection;

  const client = new Client({ host, port, user, password, database: 'postgres' });
  await client.connect();
  try {
    await client.query(`create database "${dbName}"`);
  } catch (error) {
    // 42P04 duplicate_database: someone (or a parallel worker) got there first.
    if ((error as { code?: string }).code !== '42P04') throw error;
  } finally {
    await client.end();
  }

  const orm = await MikroORM.init({
    ...ormOptions,
    ...connection,
    extensions: [Migrator],
    // The same migrator settings the CLI applies; the workspace root is four levels up.
    migrations: migratorSettings(join(__dirname, '..', '..', '..', '..')),
  });
  try {
    await orm.migrator.up();
  } finally {
    await orm.close(true);
  }
}
