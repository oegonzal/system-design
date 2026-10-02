import { randomUUID } from 'node:crypto';

import type { SaveStarStoryRequest } from '@sysdesign/contracts';

import type { E2EPorts } from './lane-ports';

/** The suite the proof is for: where its API answers, its ports, and the database it resets. */
export interface SuiteStack {
  apiUrl: string;
  ports: E2EPorts;
  database: string;
}

/** The one question the proof asks the suite's database: does a story with this title exist? */
export interface DatabaseReader {
  query(sql: string, values: unknown[]): Promise<{ rowCount: number | null }>;
}

/**
 * A story saved through the API under test must be in the suite's database.
 *
 * Playwright starts the servers before the global setup and reuses whatever
 * already answers on the suite's ports. Lanes run on ports derived from their
 * names (`lane-ports.ts`), so a server of another lane can only be found
 * there by a hash collision; when one is, this refuses the run, naming the
 * ports to free, before a single test writes into that lane's database. The
 * story is the API's own write, so no column is spelled here, and the global
 * setup's truncation removes it.
 */
export async function proveApiDatabase(
  { apiUrl, ports, database }: SuiteStack,
  reader: DatabaseReader,
  send: typeof fetch = fetch,
): Promise<void> {
  const title = `e2e lane proof ${randomUUID()}`;
  const story: SaveStarStoryRequest = {
    title,
    situation: 'The suite starts.',
    task: 'Prove the API writes into its database.',
    action: 'Save this story through the API.',
    result: 'Read it back from the database.',
    tags: [],
  };
  const saved = await send(`${apiUrl}/star-stories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(story),
  });
  if (!saved.ok) {
    throw new Error(`The API under test at ${apiUrl} refused the lane proof (${saved.status}).`);
  }
  const found = await reader.query('select 1 from "star_story" where "title" = $1', [title]);
  if ((found.rowCount ?? 0) === 0) {
    throw new Error(
      `The API answering at ${apiUrl} does not write into "${database}": it is another ` +
        `lane's server. Stop whatever listens on :${ports.api}, :${ports.ui} and ` +
        `:${ports.grader}, then run the suite again.`,
    );
  }
}
