import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CRITERIA } from '@sysdesign/criteria';
import { describe, expect, it } from 'vitest';

/**
 * The completion-criteria coverage gate.
 *
 * Tests claim a criterion by carrying its id in the title — `[EVAL-1]`,
 * `[UX-2]` — the one marker both Vitest and Playwright can carry. This spec
 * walks every spec file in the workspace and fails both ways: when any
 * registered criterion has no claimant, so a requirement cannot silently lose
 * its proof when a test is refactored away, and when a spec claims an id the
 * registry does not declare, so a proof cannot point at nothing.
 */
const WORKSPACE = join(__dirname, '..');
const SPEC_PATTERN = /\.spec\.(ts|tsx)$/;

/** A criterion id is a family and a number: `QL-19` is family `QL`. */
const ID_SHAPE = /^([A-Z]+)-\d+$/;
const REGISTERED = new Set(CRITERIA.map(({ id }) => id));
const FAMILIES = [...new Set(CRITERIA.map(({ id }) => ID_SHAPE.exec(id)?.[1] ?? id))];
/** A claim in any family the registry uses, so a bracketed id of some other kind is not read as one. */
const CLAIM = new RegExp(`\\[((?:${FAMILIES.join('|')})-\\d+)\\]`, 'g');
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

  it('declares every id as a family and a number', () => {
    // The families the reverse check reads are derived from this shape.
    expect(CRITERIA.map(({ id }) => id).filter((id) => !ID_SHAPE.test(id))).toEqual([]);
  });

  it.each(CRITERIA.map((criterion) => [criterion.id, criterion.statement]))(
    '%s has at least one claiming test — %s',
    (id) => {
      expect(corpus, `no spec title claims [${id}]`).toContain(`[${id}]`);
    },
  );

  it('claims only registered ids', () => {
    const claimed = new Set([...corpus.matchAll(CLAIM)].map(([, id]) => id));
    const unregistered = [...claimed].filter((id) => !REGISTERED.has(id)).sort();
    expect(unregistered, 'spec titles claim ids packages/criteria does not register').toEqual([]);
  });
});
