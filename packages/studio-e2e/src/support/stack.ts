import { assertTestDatabase, TEST_DATABASE_NAME } from '@sysdesign/db/test-database';

/**
 * The stack this suite runs against, declared once: its own three servers and
 * its own database. `playwright.config.ts` starts the servers from these
 * values, the stub listens on them, and the specs and support call them.
 *
 * None of the ports is one a developer's stack binds (the API on 3000, the
 * loop on 3003, govcon on 3004, the web clients on 4200–4202), so Playwright's
 * `reuseExistingServer` can only ever find a server this suite started — never
 * a dev API writing into the developer's own database. Running the suite
 * therefore needs no dev server stopped, only Postgres up.
 */
export const E2E_PORTS = {
  /** The studio API under test. */
  api: 3200,
  /** The studio UI under test, built against that API. */
  ui: 4300,
  /** The stub quality loop the API under test grades through. */
  grader: 3103,
} as const;

export const API_URL = `http://localhost:${E2E_PORTS.api}/api`;
export const UI_URL = `http://localhost:${E2E_PORTS.ui}`;
export const GRADER_HOST = '127.0.0.1';
export const GRADER_URL = `http://${GRADER_HOST}:${E2E_PORTS.grader}`;

/**
 * The database the API under test writes and the global setup resets: the
 * test database unless the environment names one (a lane of its own, or
 * CI's) — and never anything else. Read where the servers are configured and
 * again where tables are truncated, so the suite refuses before it starts a
 * server against someone's data, and before it deletes.
 */
export function suiteDatabase(env: NodeJS.ProcessEnv = process.env): string {
  const name = env['DB_NAME'] ?? TEST_DATABASE_NAME;
  assertTestDatabase(name, 'run the e2e suite against');
  return name;
}
