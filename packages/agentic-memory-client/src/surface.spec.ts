import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * What the package reaches, held as a gate: the production barrel and every
 * module it forwards import the contracts and zod alone, so a consumer that
 * takes the client takes no runtime, no store and no host; the runtime is
 * reached from the testing entry alone, which the barrel never forwards. Read
 * from each file's imports the way the compiler reads them, never from its
 * text. A spec is not held: it may take the runtime's fixtures.
 */
const SRC = __dirname;
const BARREL = 'index.ts';
const TESTING_ENTRY = 'testing.ts';
const RUNTIME = 'agentic-memory';

interface Rule {
  holds: (file: string) => boolean;
  /** The workspace packages a held file may import, by name. */
  packages: readonly string[];
  /** Every other module a held file may import: a dependency, or a node builtin. */
  modules: readonly string[];
}

const isSpec = (file: string): boolean => /\.spec\.ts$/.test(file);

/** First match wins; a file no rule holds is not held. */
const RULES: readonly Rule[] = [
  {
    holds: (file) => file === TESTING_ENTRY,
    packages: ['contracts', RUNTIME],
    modules: ['zod', 'node:crypto'],
  },
  { holds: (file) => !isSpec(file), packages: ['contracts'], modules: ['zod'] },
];

/** What a file's imports break of its rule, one line each. */
function violations(file: string, specifiers: readonly string[]): string[] {
  const rule = RULES.find((candidate) => candidate.holds(file));
  if (rule === undefined) return [];
  return specifiers.flatMap((specifier) => {
    if (specifier.startsWith('.')) {
      return specifier === `./${TESTING_ENTRY.replace(/\.ts$/, '')}` && file !== TESTING_ENTRY
        ? [`${file} reaches the testing entry`]
        : [];
    }
    const workspace = /^@sysdesign\/([^/]+)/.exec(specifier)?.[1];
    const allowed =
      workspace === undefined
        ? rule.modules.includes(specifier)
        : rule.packages.includes(workspace);
    return allowed ? [] : [`${file} imports ${specifier}`];
  });
}

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : entry.endsWith('.ts') ? [path] : [];
  });

const importsOf = (file: string): string[] =>
  ts
    .preProcessFile(readFileSync(join(SRC, file), 'utf8'), true, true)
    .importedFiles.map((imported) => imported.fileName);

describe('the surface', () => {
  const sources = files(SRC).map((path) => relative(SRC, path));
  const production = sources.filter((file) => !isSpec(file) && file !== TESTING_ENTRY);

  it('[AMC-4] the production barrel reaches contracts alone: every module but the testing entry imports its siblings, the contracts and zod, and none reaches the testing entry', () => {
    expect(production).toContain(BARREL);
    expect(production.length).toBeGreaterThan(3);
    expect(production.flatMap((file) => violations(file, importsOf(file)))).toEqual([]);
  });

  it('[AMC-4] the runtime is reached from the testing entry alone, and the barrel never forwards it', () => {
    const testing = importsOf(TESTING_ENTRY);
    // The exemption is used, so the rule above it is not passing vacuously.
    expect(testing).toContain(`@sysdesign/${RUNTIME}`);
    expect(violations(TESTING_ENTRY, testing)).toEqual([]);
    expect(importsOf(BARREL)).not.toContain('./testing');
    expect(sources).toContain(TESTING_ENTRY);
  });

  it('[AMC-4] bites: each rule refuses an import past its surface', () => {
    expect(violations('index.ts', ['./testing'])).toEqual(['index.ts reaches the testing entry']);
    expect(violations('binding.ts', ['@sysdesign/agentic-memory'])).toEqual([
      'binding.ts imports @sysdesign/agentic-memory',
    ]);
    expect(violations('http-memory-client.ts', ['node:crypto'])).toEqual([
      'http-memory-client.ts imports node:crypto',
    ]);
    expect(violations('testing.ts', ['@sysdesign/db'])).toEqual([
      'testing.ts imports @sysdesign/db',
    ]);
    expect(
      violations('testing.ts', [
        '@sysdesign/agentic-memory/testing',
        '@sysdesign/contracts',
        'node:crypto',
        './memory-client',
      ]),
    ).toEqual([]);
    expect(violations('binding.spec.ts', ['vitest', '@sysdesign/agentic-memory/testing'])).toEqual(
      [],
    );
  });
});
