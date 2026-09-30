import { execSync } from 'node:child_process';
import { join } from 'node:path';

import { Client } from 'pg';

/**
 * Makes the suite's database exist, migrated and seeded, then clears the
 * mutable state once, before the suite.
 *
 * The database defaults to `sysdesign_test` (mirroring `playwright.config.ts`,
 * which hands the same name to the API server) so an e2e run never truncates
 * the developer's real practice history — `truncate prompt cascade` takes
 * sessions and revisions with it. CI pins `DB_NAME` explicitly and is
 * unaffected.
 *
 * Sessions and revisions hang off `prompt` by foreign key, so one
 * `truncate … cascade` resets the practice side. A prompt generation row is
 * reached the same way once its draft was claimed, but an unclaimed one
 * points at no prompt yet, so the table is truncated on its own. Stories are
 * their own root. Experiences are seeded reference data — the generator needs
 * them, so an empty table is seeded via the same `pnpm db:seed` a developer
 * would run, not asserted as a failure.
 *
 * Grades live in the quality loop, not here: the suite's stub keeps its runs
 * in memory and starts empty with every run of the suite.
 */
export default async function globalSetup(): Promise<void> {
  const host = process.env['DB_HOST'] ?? 'localhost';
  const port = Number(process.env['DB_PORT'] ?? 5433);
  const user = process.env['DB_USERNAME'] ?? 'admin';
  const password = process.env['DB_PASSWORD'] ?? 'admin';
  const database = process.env['DB_NAME'] ?? 'sysdesign_test';

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
  const env = { ...process.env, DB_NAME: database, DB_PORT: String(port) };
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

    await client.query('truncate table "prompt" cascade');
    await client.query('truncate table "prompt_generation" cascade');
    await client.query('truncate table "star_story" cascade');
  } finally {
    await client.end();
  }
}
