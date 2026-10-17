import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

import ts from 'typescript';

/**
 * The service is layered — the mailbox behind its port, the tools over it,
 * the watcher beside them, the composition root — and each folder reaches
 * another only through its declared door, read from every file's imports the
 * way the compiler reads them. The tools and the watcher never know HTTP:
 * they reach the mailbox through its port alone.
 */
const SRC = __dirname;
const DOORS = ['mailbox/index.ts', 'tools/index.ts', 'watch/index.ts'];
/** The fakes that come with each door. */
const FAKES: Readonly<Record<string, string>> = { 'mailbox/index.ts': 'mailbox/testing.ts' };
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
  { holds: under('mailbox'), reaches: under('mailbox'), packages: ['contracts', 'google-kit'] },
  {
    holds: under('tools'),
    reaches: (t) => under('tools')(t) || t === 'mailbox/index.ts' || t === SETTINGS,
    packages: ['contracts', 'tool-session'],
  },
  {
    holds: under('watch'),
    reaches: (t) => under('watch')(t) || t === 'mailbox/index.ts' || t === SETTINGS,
    packages: ['contracts', 'notifications-client'],
  },
  {
    // The composition root and its specs: main, cli, config, settings, the app.
    holds: () => true,
    reaches: (t) => DOORS.includes(t) || under('app')(t) || !t.includes('/'),
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

  it('[GML-7] holds every file to its folder’s doors, and the mailbox folder alone to the Google kit', () => {
    expect(sources.length).toBeGreaterThan(15);
    expect(sources.flatMap((file) => violations(file, importsOf(join(SRC, file))))).toEqual([]);
    const reachingGoogle = sources.filter(
      (file) =>
        !isTest(file) &&
        importsOf(join(SRC, file)).some((specifier) =>
          specifier.startsWith('@sysdesign/google-kit'),
        ),
    );
    expect(reachingGoogle.every((file) => under('mailbox')(file) || !file.includes('/'))).toBe(
      true,
    );
  });

  it('[GML-7] bites: each rule refuses an import past its door', () => {
    expect(violations('tools/catalog.ts', ['../mailbox/gmail-rest/client'])).toEqual([
      'tools/catalog.ts reaches mailbox/gmail-rest/client.ts',
    ]);
    expect(violations('mailbox/ports.ts', ['../tools'])).toEqual([
      'mailbox/ports.ts reaches tools/index.ts',
    ]);
    expect(violations('watch/inbox-watcher.ts', ['@sysdesign/tool-session'])).toEqual([
      'watch/inbox-watcher.ts imports @sysdesign/tool-session',
    ]);
    expect(
      violations('app/app.module.ts', ['../mailbox', '../tools', '../watch', '../config']),
    ).toEqual([]);
    expect(violations('app/testing.ts', ['../mailbox/testing'])).toEqual([]);
  });
});
