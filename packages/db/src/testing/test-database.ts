/**
 * The one database a test may empty, declared once.
 *
 * Every suite that touches Postgres resets state by truncating tables, so the
 * database it runs against must be one nobody keeps anything in. That is
 * `sysdesign_test`, or a lane of its own beside it — `sysdesign_test_<lane>`,
 * for a worktree or a parallel job that must not share rows with the default
 * one. Any other name is someone's data: the developer's `sysdesign`, a pod's,
 * a production server's. The rule is the name, not the defaults — a default
 * is what an unset `DB_NAME` falls back to, and a set one (CI, a `.env` Nx
 * loads for every task, a shell export) wins over it.
 *
 * Its own entry point, `@sysdesign/db/test-database`, with no imports: the e2e
 * suite's config and global setup run under Playwright's transform, and the
 * Vite configs load it before any plugin resolves an alias.
 */
export const TEST_DATABASE_NAME = 'sysdesign_test';

/**
 * The grammar of a disposable name: the test database, optionally followed by
 * `_` and a lane of lower-case letters, digits and underscores — a name
 * Postgres takes unquoted. Built from the declared name, never spelled twice.
 */
const DISPOSABLE = new RegExp(`^${TEST_DATABASE_NAME}(?:_([a-z0-9_]+))?$`);

/** True for the test database and for a lane of it; false for every other name. */
export const isTestDatabase = (name: string): boolean => DISPOSABLE.test(name);

/**
 * The lane a test database names — `recall` for `sysdesign_test_recall` — or
 * null for the test database itself. Any other name is refused: it names no
 * lane, because it is not a test database.
 */
export function testDatabaseLane(name: string): string | null {
  assertTestDatabase(name, 'name the lane of');
  return DISPOSABLE.exec(name)?.[1] ?? null;
}

/**
 * Refuse, naming the database, unless it is disposable. Called by everything
 * that prepares or empties a test database, before it connects or deletes.
 */
export function assertTestDatabase(name: string, action: string): void {
  if (isTestDatabase(name)) return;
  throw new Error(
    `Refusing to ${action} database "${name}": tests only ever run against ` +
      `"${TEST_DATABASE_NAME}" or "${TEST_DATABASE_NAME}_<lane>", so a test run can never ` +
      `wipe data someone keeps. Unset DB_NAME (the suites default to "${TEST_DATABASE_NAME}") ` +
      `or point it at a test database.`,
  );
}
