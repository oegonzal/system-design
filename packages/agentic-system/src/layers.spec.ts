import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

import ts from 'typescript';

/**
 * The service is layered — the component catalog, the design cycle it runs,
 * the memory spaces it serves, the composition root — and each folder reaches
 * another only through its declared door, read from every file's imports the
 * way the compiler reads them. A spec or a testing file may also take the
 * fakes of a door its folder reaches. The catalog names vendors on purpose
 * (that is its content); only the folder doors are enforced here. The memory
 * layer takes its embedder from the composition root and never builds one, so
 * the llm package is the root's alone.
 */
const SRC = __dirname;
const DOORS = ['catalog/index.ts', 'designs/index.ts', 'memory/index.ts'];
/** The fakes that come with each door. */
const FAKES: Readonly<Record<string, string>> = { 'designs/index.ts': 'designs/testing.ts' };
const ALL_PACKAGES = ['*'];

interface Rule {
  holds: (file: string) => boolean;
  reaches: (target: string) => boolean;
  packages: readonly string[];
}

const under = (folder: string) => (path: string) => path.startsWith(`${folder}/`);

/** First match wins. */
const RULES: readonly Rule[] = [
  { holds: under('common'), reaches: under('common'), packages: [] },
  { holds: under('catalog'), reaches: under('catalog'), packages: ['contracts'] },
  {
    holds: under('designs'),
    reaches: (t) => under('designs')(t) || under('common')(t) || t === 'catalog/index.ts',
    packages: ['contracts', 'db', 'nest-kit', 'loop-client', 'notifications-client'],
  },
  {
    holds: under('memory'),
    reaches: (t) => under('memory')(t) || under('common')(t),
    packages: ['contracts', 'db', 'nest-kit', 'loop-client', 'agentic-memory', 'qdrant-kit'],
  },
  {
    // The composition root and its specs: main, config, settings, the app.
    holds: () => true,
    reaches: (t) => DOORS.includes(t) || under('common')(t) || under('app')(t) || !t.includes('/'),
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
      return rule.reaches(target) ||
        fake ||
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

  it('[AGS-6] holds every file to its folder’s doors', () => {
    expect(sources.length).toBeGreaterThan(15);
    expect(sources.flatMap((file) => violations(file, importsOf(join(SRC, file))))).toEqual([]);
  });

  it('[AGS-6] bites: each rule refuses an import past its door', () => {
    expect(violations('designs/designs.module.ts', ['../config'])).toEqual([
      'designs/designs.module.ts reaches config.ts',
    ]);
    expect(violations('catalog/index.ts', ['@sysdesign/loop-client'])).toEqual([
      'catalog/index.ts imports @sysdesign/loop-client',
    ]);
    expect(violations('common/clock.ts', ['../designs'])).toEqual([
      'common/clock.ts reaches designs/index.ts',
    ]);
    // The embedder arrives by inversion of control: the memory layer never builds a model client.
    expect(violations('memory/memory.module.ts', ['@sysdesign/llm'])).toEqual([
      'memory/memory.module.ts imports @sysdesign/llm',
    ]);
    expect(violations('memory/spaces.service.ts', ['../designs'])).toEqual([
      'memory/spaces.service.ts reaches designs/index.ts',
    ]);
    expect(violations('memory/memory.module.ts', ['@sysdesign/agentic-memory'])).toEqual([]);
    // A test file in the composition layer may take a door's fakes; the root reaches the doors.
    expect(violations('probe.spec.ts', ['./designs', './designs/testing'])).toEqual([]);
    expect(violations('designs/driver.ts', ['@sysdesign/loop-client'])).toEqual([]);
  });
});
