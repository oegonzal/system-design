import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

import ts from 'typescript';

/**
 * The library is layered — the catalog, the session that runs over it, the
 * Nest surface over both, the command line over the session — and each
 * folder reaches another only through its declared door, read from every
 * file's imports the way the compiler reads them. The settings sit at the
 * root beside the barrels, read by the session and the Nest module alike.
 */
const SRC = __dirname;
const DOORS = ['catalog/index.ts', 'session/index.ts', 'nest/index.ts', 'cli/index.ts'];
/** The fakes that come with each door. */
const FAKES: Readonly<Record<string, string>> = {
  'session/index.ts': 'session/testing.ts',
  'nest/index.ts': 'nest/testing.ts',
};
const ALL_PACKAGES = ['*'];

interface Rule {
  holds: (file: string) => boolean;
  reaches: (target: string) => boolean;
  packages: readonly string[];
}

const under = (folder: string) => (path: string) => path.startsWith(`${folder}/`);
const SETTINGS = 'settings.ts';

/** First match wins. */
const RULES: readonly Rule[] = [
  { holds: under('catalog'), reaches: under('catalog'), packages: ['contracts'] },
  {
    holds: under('session'),
    reaches: (t) => under('session')(t) || t === 'catalog/index.ts' || t === SETTINGS,
    packages: ['contracts', 'loop-client', 'notifications-client'],
  },
  {
    holds: under('nest'),
    reaches: (t) =>
      under('nest')(t) || t === 'catalog/index.ts' || t === 'session/index.ts' || t === SETTINGS,
    // `db` for its test-database guard alone: the module reaches no database.
    packages: ['contracts', 'db', 'nest-kit', 'loop-client', 'notifications-client'],
  },
  {
    holds: under('cli'),
    reaches: (t) => under('cli')(t) || t === 'session/index.ts',
    packages: ['contracts'],
  },
  {
    // The barrels, the settings and the root specs.
    holds: () => true,
    reaches: (t) => DOORS.includes(t) || !t.includes('/'),
    packages: ALL_PACKAGES,
  },
];

const isTest = (file: string): boolean =>
  /\.spec\.ts$/.test(file) || /(^|\/)testing\.ts$/.test(file);

/** Where a relative import lands, as a path from `src/`. */
function landing(file: string, specifier: string): string {
  const base = normalize(join(dirname(file), specifier));
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      if (statSync(join(SRC, candidate)).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return `${base}.ts`;
}

/** What a file's imports break of its rule, one line each. */
function violations(file: string, specifiers: readonly string[]): string[] {
  const rule = RULES.find((candidate) => candidate.holds(file));
  if (rule === undefined) return [`${file}: no rule holds it`];
  return specifiers.flatMap((specifier) => {
    if (specifier.startsWith('.')) {
      const target = landing(file, specifier);
      const fake =
        isTest(file) &&
        Object.entries(FAKES).some(([door, fakes]) => fakes === target && rule.reaches(door));
      // A folder's own fakes may take its siblings' fakes: a booted app runs over a faked session.
      const siblingFake =
        isTest(file) &&
        Object.values(FAKES).includes(target) &&
        rule.reaches(dirname(target) + '/index.ts');
      return rule.reaches(target) ||
        fake ||
        siblingFake ||
        (isTest(file) && target === file.replace(/\.spec\.ts$/, '.ts'))
        ? []
        : [`${file} reaches ${target}`];
    }
    const workspace = /^@sysdesign\/([^/]+)/.exec(specifier)?.[1];
    if (workspace === undefined || rule.packages === ALL_PACKAGES) return [];
    return rule.packages.includes(workspace) ? [] : [`${file} imports @sysdesign/${workspace}`];
  });
}

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : entry.endsWith('.ts') ? [path] : [];
  });

const importsOf = (path: string): string[] =>
  ts
    .preProcessFile(readFileSync(path, 'utf8'), true, true)
    .importedFiles.map((imported) => imported.fileName);

describe('the layers', () => {
  const sources = files(SRC).map((path) => relative(SRC, path));

  it('[TSS-6] holds every file to its folder’s doors', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.flatMap((file) => violations(file, importsOf(join(SRC, file))))).toEqual([]);
  });

  it('[TSS-6] bites: each rule refuses an import past its door', () => {
    expect(violations('catalog/catalog.ts', ['../session'])).toEqual([
      'catalog/catalog.ts reaches session/index.ts',
    ]);
    expect(violations('session/registry.ts', ['../catalog/catalog'])).toEqual([
      'session/registry.ts reaches catalog/catalog.ts',
    ]);
    expect(violations('session/registry.ts', ['@sysdesign/nest-kit'])).toEqual([
      'session/registry.ts imports @sysdesign/nest-kit',
    ]);
    expect(violations('cli/session-cli.ts', ['../nest'])).toEqual([
      'cli/session-cli.ts reaches nest/index.ts',
    ]);
    expect(
      violations('nest/tool-session.module.ts', ['../session', '../catalog', '../settings']),
    ).toEqual([]);
    expect(violations('nest/testing.ts', ['../session/testing'])).toEqual([]);
  });
});
