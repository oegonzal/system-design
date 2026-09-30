import { join } from 'node:path';

import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';

import { connectionSettings } from '../connection';
import { ormOptions } from '../orm.options';

/**
 * Test support: make the configured database exist and be migrated, so suites
 * can point `DB_NAME` at a dedicated test database (`sysdesign_test`) instead
 * of truncating whatever the developer's dev database holds. Creating is a
 * one-time race the duplicate-database error absorbs; migrating is the same
 * idempotent `migration:up` the CLI runs.
 *
 * Memoised per process — every harness calls it, only the first one pays.
 */
let ensured: Promise<void> | null = null;

export function ensureDatabase(): Promise<void> {
  ensured ??= createAndMigrate();
  return ensured;
}

async function createAndMigrate(): Promise<void> {
  // Read the environment at call time: `ormOptions` snapshots it at import,
  // and the maintenance connection must not depend on module load order.
  const connection = connectionSettings(process.env);
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
    migrations: {
      path: join(__dirname, '../migrations'),
      tableName: 'mikro_orm_migrations',
      transactional: true,
      allOrNothing: true,
      snapshot: false,
    },
  });
  try {
    await orm.migrator.up();
  } finally {
    await orm.close(true);
  }
}
