import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Tests empty tables through guarded doors only.
 *
 * Every suite that touches Postgres resets it by emptying tables, and the one
 * thing that must never happen is a reset landing on someone's data. The
 * guard (`packages/db/src/testing/test-database.ts`) refuses any database
 * that is not a test one; this gate keeps it unavoidable, by pinning the only
 * files allowed to issue a statement that empties a table. A new suite that
 * truncates by hand fails here, and is pointed at `truncateTestTables`.
 */
const REPO = join(__dirname, '..');
const SKIP = new Set([
  'node_modules',
  'dist',
  '.next',
  '.next-dev',
  '.next-e2e',
  'storybook-static',
  'migrations',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry) ? [path] : [];
  });
}

const relative = (path: string): string => path.slice(REPO.length + 1);

/** A statement that empties a table: SQL `truncate`, or a MikroORM delete with no filter. */
const EMPTIES_A_TABLE = /\btruncate\s+table\b|\.nativeDelete\(\s*\w+\s*,\s*\{\s*\}\s*\)/i;

/** The doors, each guarded before it deletes. */
const GUARDED = [
  // Asks the connection which database it is on, and refuses unless a test one.
  'packages/db/src/testing/truncate-test-tables.ts',
  // Runs under Playwright's transform, which cannot load the entities the
  // helper names tables by; refuses through `suiteDatabase()` first.
  'packages/studio-e2e/src/support/global-setup.ts',
  // The guard's own spec: it asserts the statement text against a recording
  // fake, and no connection exists.
  'packages/db/src/testing/test-database.spec.ts',
];

describe('test database guarantees', () => {
  const files = sourceFiles(join(REPO, 'packages'));

  it('finds the workspace it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('only the guarded doors empty a table', () => {
    const emptying = files.filter((path) => EMPTIES_A_TABLE.test(readFileSync(path, 'utf8')));
    expect(emptying.map(relative).sort()).toEqual([...GUARDED].sort());
  });
});
