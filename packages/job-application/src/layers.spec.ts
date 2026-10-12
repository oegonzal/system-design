import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

import ts from 'typescript';

/**
 * The service is layered — the advisor protocol, the applications it is kept
 * over, the intake that feeds them — and each folder reaches another only
 * through its declared door, read from every file's imports the way the
 * compiler reads them. A spec or a testing file may also take the fakes of a
 * layer its folder reaches.
 */
const SRC = __dirname;
const DOORS = ['advisor/index.ts', 'applications/index.ts', 'intake/index.ts'];
/** The fakes that come with each door. */
const FAKES: Readonly<Record<string, string>> = {
  'applications/index.ts': 'applications/testing.ts',
  'intake/index.ts': 'intake/testing.ts',
};
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
  // The protocol's side: it never learns what the record is of.
  { holds: under('advisor'), reaches: under('advisor'), packages: ['contracts', 'nest-kit'] },
  {
    holds: under('applications'),
    reaches: (t) => under('applications')(t) || under('common')(t) || t === 'advisor/ports.ts',
    packages: ['contracts', 'db', 'nest-kit'],
  },
  {
    holds: under('intake'),
    reaches: (t) => under('intake')(t) || under('common')(t) || t === 'applications/index.ts',
    packages: ['contracts', 'nest-kit', 'notifications-client'],
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

  it('[JA-7] holds every file to its folder’s doors', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.flatMap((file) => violations(file, importsOf(join(SRC, file))))).toEqual([]);
  });

  it('[JA-7] keeps the advisor layer free of the domain’s words', () => {
    const advisor = sources.filter(under('advisor'));
    expect(advisor.length).toBeGreaterThan(1);
    for (const file of advisor) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).not.toMatch(/applicat|company|job/i);
    }
  });

  it('[JA-7] bites: each rule refuses an import past its door', () => {
    expect(violations('advisor/advisor.controller.ts', ['../applications/policy'])).toEqual([
      'advisor/advisor.controller.ts reaches applications/policy.ts',
    ]);
    expect(violations('applications/record-source.ts', ['../intake/settings'])).toEqual([
      'applications/record-source.ts reaches intake/settings.ts',
    ]);
    expect(
      violations('intake/session-events.consumer.ts', ['../applications/session-record']),
    ).toEqual(['intake/session-events.consumer.ts reaches applications/session-record.ts']);
    expect(violations('intake/session-events.consumer.ts', ['../applications'])).toEqual([]);
    expect(violations('applications/policy.ts', ['@sysdesign/notifications-client'])).toEqual([
      'applications/policy.ts imports @sysdesign/notifications-client',
    ]);
    expect(violations('app/http.spec.ts', ['../intake/testing', '../intake'])).toEqual([]);
    expect(violations('common/clock.ts', ['../applications'])).toEqual([
      'common/clock.ts reaches applications/index.ts',
    ]);
  });
});
