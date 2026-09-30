import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CRITERIA } from '../packages/criteria/src/index';

/**
 * The completion-criteria coverage gate.
 *
 * Tests claim a criterion by carrying its id in the title — `[EVAL-1]`,
 * `[UX-2]` — the one marker both Vitest and Playwright can carry. This spec
 * walks every spec file in the workspace and fails when any registered
 * criterion has no claimant, so a requirement cannot silently lose its proof
 * when a test is refactored away.
 */
const WORKSPACE = join(__dirname, '..');
const SPEC_PATTERN = /\.spec\.(ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'storybook-static']);

function collectSpecFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectSpecFiles(path, found);
    } else if (SPEC_PATTERN.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

describe('criteria coverage', () => {
  const specs = collectSpecFiles(join(WORKSPACE, 'packages'));
  const corpus = specs.map((path) => readFileSync(path, 'utf8')).join('\n');

  it('finds a meaningful number of spec files to scan', () => {
    // A refactor that breaks the walk would otherwise pass vacuously.
    expect(specs.length).toBeGreaterThan(20);
  });

  it.each(CRITERIA.map((criterion) => [criterion.id, criterion.statement]))(
    '%s has at least one claiming test — %s',
    (id) => {
      expect(corpus, `no spec title claims [${id}]`).toContain(`[${id}]`);
    },
  );
});
