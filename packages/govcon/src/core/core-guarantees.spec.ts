import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The core is pure by construction, and this pins it: no clock, no environment,
 * no filesystem, no network. Time reaches the core as a parameter and the
 * environment is read once, in the SAM.gov factory.
 */
const FORBIDDEN: readonly [string, RegExp][] = [
  ['a clock read', /Date\.now\(|new Date\(\)/],
  ['the environment', /process\.env/],
  ['the filesystem', /node:fs|from 'fs'/],
  ['the network', /\bfetch\(|node:http/],
  ['Nest', /@nestjs\//],
];

const sources = readdirSync(__dirname)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .map((name) => [name, readFileSync(join(__dirname, name), 'utf8')] as const);

describe('the core', () => {
  it('has source files to guard', () => {
    expect(sources.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'ports.ts',
        'budgeted-source.ts',
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
