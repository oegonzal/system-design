import { execSync } from 'node:child_process';
import { join } from 'node:path';

import { connectionSettings } from '@sysdesign/db/connection';
import { Client } from 'pg';

import { proveApiDatabase } from './api-database-proof';
import { API_URL, E2E_PORTS, suiteDatabase } from './stack';

/**
 * Makes the suite's database exist, migrated and seeded, then clears the
 * mutable state once, before the suite.
 *
 * The database is `suiteDatabase()` — the same one `playwright.config.ts`
 * hands the API server — and it refuses anything but a test database before
 * this connects, so an e2e run can never truncate the developer's practice
 * history: `truncate prompt cascade` takes sessions and revisions with it.
 * The guard is `truncateTestTables`'s, applied here by hand only because this
 * file runs under Playwright's transform, which cannot load the entities.
 *
 * Sessions and revisions hang off `prompt` by foreign key, so one
 * `truncate … cascade` resets the practice side. A prompt generation row is
 * reached the same way once its draft was claimed, but an unclaimed one
 * points at no prompt yet, so the table is truncated on its own. Stories are
 * their own root. Experiences are seeded reference data — the generator needs
 * them, so an empty table is seeded via the same `pnpm db:seed` a developer
 * would run, not asserted as a failure.
 *
 * Before anything is reset, the API under test proves it reads this database
 * (`proveApiDatabase`): Playwright starts the servers before this runs and
 * reuses whatever already answers on the suite's ports, so a server another
 * lane left there is refused here rather than tested against — sent one read,
 * never a write into its lane's database.
 *
 * Grades live in the quality loop, not here: the suite's stub keeps its runs
 * in memory and starts empty with every run of the suite.
 */
export default async function globalSetup(): Promise<void> {
  const database = suiteDatabase();
  const { host, port, user, password } = connectionSettings(process.env);

  // Create the database if it does not exist yet (42P04 = already there).
  const maintenance = new Client({ host, port, user, password, database: 'postgres' });
  await maintenance.connect();
  try {
    await maintenance.query(`create database "${database}"`);
  } catch (error) {
    if ((error as { code?: string }).code !== '42P04') throw error;
  } finally {
    await maintenance.end();
  }

  // Idempotent: applies only pending migrations. Run via the root scripts so
  // this file stays dependency-light and cannot drift from the CLI's config.
  const repoRoot = join(__dirname, '../../../..');
  const env = { ...process.env, DB_NAME: database };
  execSync('pnpm db:migrate', { cwd: repoRoot, env, stdio: 'inherit' });

  const client = new Client({ host, port, user, password, database });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(
      'select count(*) as count from "experience_profile"',
    );
    if (Number(result.rows[0].count) === 0) {
      execSync('pnpm db:seed', { cwd: repoRoot, env, stdio: 'inherit' });
    }

    await proveApiDatabase({ apiUrl: API_URL, ports: E2E_PORTS, database }, client);

    await client.query('truncate table "prompt" cascade');
    await client.query('truncate table "prompt_generation" cascade');
    await client.query('truncate table "star_story" cascade');
  } finally {
    await client.end();
  }
}
