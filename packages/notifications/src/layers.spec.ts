import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

import ts from 'typescript';

/**
 * The service is layered — the bus, the interactions over it, the channels
 * they deliver through — and each folder reaches another only through its
 * declared door, read from every file's imports the way the compiler reads
 * them. A spec or a testing file may also take the fakes of a layer its folder
 * reaches. A channel is a folder that only `channels/index.ts` imports, and
 * that imports nothing of the service but the channel port.
 */
const SRC = __dirname;
const DOORS = ['bus/index.ts', 'interactions/index.ts', 'channels/index.ts', 'channels/port.ts'];
/** The fakes that come with each door. */
const FAKES: Readonly<Record<string, string>> = {
  'bus/index.ts': 'bus/testing.ts',
  'interactions/index.ts': 'interactions/testing.ts',
  'channels/port.ts': 'channels/testing.ts',
};
const ALL_PACKAGES = ['*'];

interface Rule {
  /** Which files it holds, by their path from `src/`. */
  holds: (file: string) => boolean;
  /** Where in the package an import may land. */
  reaches: (target: string) => boolean;
  /** The workspace packages it may import. */
  packages: readonly string[];
}

const under = (folder: string) => (path: string) => path.startsWith(`${folder}/`);
const channelOf = (path: string): string | null => /^channels\/([^/]+)\//.exec(path)?.[1] ?? null;

/** First match wins. */
const RULES: readonly Rule[] = [
  { holds: (f) => f === 'channels/port.ts', reaches: () => false, packages: ['contracts'] },
  {
    holds: (f) => f === 'channels/index.ts',
    reaches: (t) => t === 'channels/port.ts' || /^channels\/[^/]+\/definition\.ts$/.test(t),
    packages: [],
  },
  {
    holds: (f) => f === 'channels/testing.ts',
    reaches: (t) => t === 'channels/port.ts',
    packages: ['contracts'],
  },
  {
    holds: (f) => channelOf(f) !== null,
    reaches: (t) => t === 'channels/port.ts',
    packages: ['contracts'],
  },
  { holds: under('common'), reaches: under('common'), packages: [] },
  {
    holds: under('bus'),
    reaches: (t) => under('bus')(t) || under('common')(t),
    packages: ['contracts', 'db', 'nest-kit'],
  },
  {
    holds: under('interactions'),
    reaches: (t) =>
      under('interactions')(t) ||
      under('common')(t) ||
      t === 'bus/index.ts' ||
      t === 'channels/port.ts',
    packages: ['contracts', 'db', 'nest-kit'],
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
  const own = channelOf(file);
  return specifiers.flatMap((specifier) => {
    if (specifier.startsWith('.')) {
      const target = landing(file, specifier);
      const sameChannel = own !== null && channelOf(target) === own;
      const fake =
        isTest(file) &&
        Object.entries(FAKES).some(([door, fakes]) => fakes === target && rule.reaches(door));
      return sameChannel ||
        rule.reaches(target) ||
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

  it('[NTF-10] holds every file to its folder’s doors', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.flatMap((file) => violations(file, importsOf(join(SRC, file))))).toEqual([]);
  });

  it('[NTF-10] imports each channel only from the channel registry, and names it nowhere else', () => {
    const channels = sources.map(channelOf).filter((id): id is string => id !== null);
    for (const id of new Set(channels)) {
      const importers = sources.filter(
        (file) =>
          channelOf(file) !== id &&
          importsOf(join(SRC, file)).some(
            (specifier) =>
              specifier.startsWith('.') && landing(file, specifier).startsWith(`channels/${id}/`),
          ),
      );
      expect(importers, id).toEqual(['channels/index.ts']);
    }
  });

  it('[NTF-10] bites: each rule refuses an import past its door', () => {
    expect(violations('bus/bus.ts', ['../interactions/dispatcher'])).toEqual([
      'bus/bus.ts reaches interactions/dispatcher.ts',
    ]);
    expect(violations('interactions/dispatcher.ts', ['../bus/bus'])).toEqual([
      'interactions/dispatcher.ts reaches bus/bus.ts',
    ]);
    expect(violations('interactions/dispatcher.ts', ['../bus'])).toEqual([]);
    expect(violations('interactions/inbound.ts', ['../channels/pager/pager-channel'])).toEqual([
      'interactions/inbound.ts reaches channels/pager/pager-channel.ts',
    ]);
    expect(violations('channels/pager/pager-channel.ts', ['../../bus', '@sysdesign/db'])).toEqual([
      'channels/pager/pager-channel.ts reaches bus/index.ts',
      'channels/pager/pager-channel.ts imports @sysdesign/db',
    ]);
    expect(violations('channels/pager/pager-channel.ts', ['./render', '../port'])).toEqual([]);
    expect(violations('channels/index.ts', ['./pager/render'])).toEqual([
      'channels/index.ts reaches channels/pager/render.ts',
    ]);
    expect(violations('common/clock.ts', ['../bus'])).toEqual([
      'common/clock.ts reaches bus/index.ts',
    ]);
    // A spec takes the fakes of a layer its folder reaches, and of no other.
    expect(
      violations('interactions/inbound.spec.ts', ['../bus/testing', '../channels/testing']),
    ).toEqual([]);
    expect(violations('bus/bus.spec.ts', ['../interactions/testing'])).toEqual([
      'bus/bus.spec.ts reaches interactions/testing.ts',
    ]);
  });
});
