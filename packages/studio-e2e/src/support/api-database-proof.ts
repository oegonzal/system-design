import { randomUUID } from 'node:crypto';

import type { GetStarStoryResponse } from '@sysdesign/contracts';

import type { E2EPorts } from './lane-ports';

/** The suite the proof is for: where its API answers, its ports, and the database it resets. */
export interface SuiteStack {
  apiUrl: string;
  ports: E2EPorts;
  database: string;
}

/** The suite's own database, as the proof uses it: one parameterised statement at a time. */
export interface SuiteDatabase {
  query(sql: string, values: unknown[]): Promise<unknown>;
}

/**
 * The API under test must read the suite's database — proven without writing
 * into any other.
 *
 * Playwright starts the servers before the global setup and reuses whatever
 * already answers on the suite's ports. Lanes run on ports derived from their
 * names (`lane-ports.ts`), so a server of another lane can only be found
 * there by a hash collision; when one is, this refuses the run, naming the
 * ports to free, before a single test writes into that lane's database.
 *
 * The probe is a story planted straight into the suite's database under a
 * fresh id, then asked for through the API by that id: only an API on this
 * database can answer it. The API is sent that one read and nothing else, so
 * a refused run leaves another lane's database as it found it. The planting is
 * SQL, so `star_story`'s required columns are spelled here — a migration that
 * adds one fails the insert loudly, never the proof silently — and the probe
 * is deleted again by its id whatever the answer.
 */
export async function proveApiDatabase(
  { apiUrl, ports, database }: SuiteStack,
  db: SuiteDatabase,
  send: typeof fetch = fetch,
): Promise<void> {
  const probe = { id: randomUUID(), title: `e2e lane proof ${randomUUID()}` };
  await db.query(
    `insert into "star_story"
       ("id", "title", "situation", "task", "action", "result", "tags", "created_at", "updated_at")
     values ($1, $2, '', '', '', '', '{}', now(), now())`,
    [probe.id, probe.title],
  );
  try {
    const answer = await send(`${apiUrl}/star-stories/${probe.id}`);
    const story = answer.ok
      ? ((await answer.json().catch(() => null)) as Partial<GetStarStoryResponse> | null)
      : null;
    if (story?.data?.title === probe.title) return;
    if (answer.ok || answer.status === 404) {
      throw new Error(
        `The API answering at ${apiUrl} does not read "${database}": it is another ` +
          `lane's server. Stop whatever listens on :${ports.api}, :${ports.ui} and ` +
          `:${ports.grader}, then run the suite again.`,
      );
    }
    throw new Error(`The API under test at ${apiUrl} refused the lane proof (${answer.status}).`);
  } finally {
    await db.query('delete from "star_story" where "id" = $1', [probe.id]);
  }
}
