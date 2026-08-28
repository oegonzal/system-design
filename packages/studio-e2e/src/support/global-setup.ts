import { Client } from 'pg';

/**
 * Clears the mutable state once, before the suite.
 *
 * Prompts, sessions, revisions, evaluations, findings and eval jobs all hang
 * off `prompt` by foreign key, so one `truncate … cascade` resets the whole
 * practice side. Stories are their own root. Experiences are seeded
 * reference data — the generator needs them, so they are deliberately left
 * alone, and their absence is a hard, explained failure rather than a page
 * of timeouts twenty seconds later.
 */
export default async function globalSetup(): Promise<void> {
  const client = new Client({
    host: process.env['DB_HOST'] ?? 'localhost',
    port: Number(process.env['DB_PORT'] ?? 5432),
    user: process.env['DB_USERNAME'] ?? 'admin',
    password: process.env['DB_PASSWORD'] ?? 'admin',
    database: process.env['DB_NAME'] ?? 'sysdesign',
  });

  await client.connect();
  try {
    await client.query('truncate table "prompt" cascade');
    await client.query('truncate table "star_story" cascade');

    const result = await client.query<{ count: string }>(
      'select count(*) as count from "experience_profile"',
    );
    if (Number(result.rows[0].count) === 0) {
      throw new Error(
        'No seeded experiences found — the prompt generator has nothing to draw from. ' +
          'Run `pnpm db:migrate && pnpm db:seed` against this database first.',
      );
    }
  } finally {
    await client.end();
  }
}
