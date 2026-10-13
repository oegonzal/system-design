import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The core is pure by construction, and this pins it: no clock, no environment,
 * no filesystem, no network. Time reaches the core as a parameter and the
 * environment is read once, in the sources' factory.
 */
const FORBIDDEN: readonly [string, RegExp][] = [
  ['a clock read', /Date\.now\(|new Date\(\)/],
  ['the environment', /process\.env/],
  ['the filesystem', /node:fs|from 'fs'/],
  ['the network', /\bfetch\(|node:http/],
  ['Nest', /@nestjs\//],
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) return walk(file);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [file] : [];
  });
}

const sources = walk(__dirname).map(
  (file) => [relative(__dirname, file), readFileSync(file, 'utf8')] as const,
);

describe('the core', () => {
  it('has source files to guard', () => {
    expect(sources.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'ports/index.ts',
        'ports/ledger.ts',
        'budget/gate.ts',
        'budget/policy.ts',
        'spending/lens.ts',
        'spending/recompetes.ts',
        'spending/alerts.ts',
        'scoring.ts',
        'profile.ts',
        'plan.ts',
      ]),
    );
  });

  it.each(FORBIDDEN)('never reaches for %s', (_what, pattern) => {
    for (const [name, content] of sources) {
      expect(content, name).not.toMatch(pattern);
    }
  });
});
