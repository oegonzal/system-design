import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  DEPLOY_PATHS,
  deployWatched,
  unwatched,
  workflowEntry,
} from '../packages/website/integrations/watched-inputs';

/**
 * What loads before the Enfav site's build stays where its deploy workflow
 * looks.
 *
 * The build checks what its tools report reading
 * (packages/website/integrations/watched-inputs.ts, whose header names the
 * reads no tool reports). It cannot see what loads before it: Astro's config,
 * with every module the config imports — that integration among them — and the
 * TypeScript config the build compiles with, with every config it extends.
 * This walk holds those to the same paths, the workflow's `paths` as
 * DEPLOY_PATHS declares them, and holds the workflow to that declaration.
 * Every script the config reaches is walked, wherever it lies, so a watched
 * file outside the package cannot hide what it imports; only relative
 * specifiers are followed, so the walk never enters an installed package.
 * Scripts are read by the TypeScript compiler's scanner. A
 * specifier that could name more than one file — no extension, or a `.js` a
 * TypeScript file answers — has every file it could name read, so no resolver's
 * order decides what is checked, and one that names no file fails.
 */
const REPO = join(__dirname, '..');
const SITE = join(REPO, 'packages', 'website');

/** Where loading starts: Astro reads this config before the build begins. */
const CONFIG = join(SITE, 'astro.config.ts');
/** The TypeScript config the build compiles with. */
const TSCONFIG = join(SITE, 'tsconfig.json');

/** The workflow whose `paths` decide when the site deploys. */
const WORKFLOW = join(REPO, '.github', 'workflows', 'deploy-website.yml');

/** The files a script may import without naming an extension, in every flavour TypeScript and Vite load. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

/** The TypeScript files that answer a JavaScript specifier (`./og.js` loads `og.ts`). */
const TYPESCRIPT_TWINS: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

/** The scripts the walk reads imports from; any other file it reaches names nothing. */
const SCRIPTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

/** Specifier schemes the build resolves itself, never from node_modules. */
const BUILT_IN_SCHEMES = new Set(['astro:', 'node:']);

const manifest = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const DECLARED = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);

/** The scheme of a URL-shaped specifier (`astro:assets` → `astro:`); null for a path or package name. */
const schemeOf = (specifier: string): string | null =>
  URL.canParse(specifier) ? new URL(specifier).protocol : null;

/** The declared dependency a bare specifier resolves into (`astro/config` → `astro`), if any. */
const dependencyOf = (specifier: string): string | undefined => {
  const segments = specifier.split('/');
  return segments
    .map((_, index) => segments.slice(0, index + 1).join('/'))
    .find((name) => DECLARED.has(name));
};

/** Why a bare specifier escapes what the workflow watches, or null when it does not. */
const bareEscapeOf = (specifier: string): string | null =>
  BUILT_IN_SCHEMES.has(schemeOf(specifier) ?? '') || dependencyOf(specifier) !== undefined
    ? null
    : 'is not a root package.json dependency';

/**
 * Every file a relative specifier could name, as the file system has them: the
 * path itself, its TypeScript twins, and the path with each extension or as a
 * folder's index. Parsed as a URL against the importing file, so a query
 * (`?raw`) is dropped rather than read as part of the name.
 */
function filesNamed(from: string, specifier: string): string[] {
  const target = fileURLToPath(new URL(specifier, pathToFileURL(from)));
  const extension = extname(target);
  const twins = (TYPESCRIPT_TWINS[extension] ?? []).map(
    (twin) => target.slice(0, -extension.length) + twin,
  );
  return [
    target,
    ...twins,
    ...EXTENSIONS.map((each) => target + each),
    ...EXTENSIONS.map((each) => join(target, `index${each}`)),
  ].filter((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

/**
 * The entries of the deploy workflow's `paths` list, read by its lines the way
 * code-review/config.spec.ts reads ci.yml: it is the workflow's only `paths:`
 * key, and its list runs until a line indented no deeper than the key. Blank
 * and comment lines are skipped; any other line that is not one single-quoted
 * entry is kept as written, so it matches no declared entry and the comparison
 * below fails.
 */
function workflowPaths(): string[] {
  const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === 'paths:');
  const depth = (line: string): number => line.length - line.trimStart().length;
  const entries: string[] = [];
  for (const line of start === -1 ? [] : lines.slice(start + 1)) {
    const text = line.trim();
    if (text === '' || text.startsWith('#')) continue;
    if (depth(line) <= depth(lines[start] ?? '')) break;
    entries.push(/^- '([^']+)'$/.exec(text)?.[1] ?? text);
  }
  return entries;
}

/** Every config file the build's TypeScript config extends, as the compiler resolves them. */
function extendedConfigs(): readonly string[] {
  const config = ts.readJsonConfigFile(TSCONFIG, ts.sys.readFile);
  ts.parseJsonSourceFileConfigFileContent(config, ts.sys, dirname(TSCONFIG));
  return config.extendedSourceFiles ?? [];
}

/** Every file that loads before the build, and every way one escapes what the workflow watches. */
function walkTheConfig(): { read: string[]; escapes: string[] } {
  const queue = [CONFIG];
  const seen = new Set(queue);
  const read: string[] = [];
  const escapes: string[] = [];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    read.push(file);
    if (!SCRIPTS.has(extname(file))) continue;
    const where = relative(REPO, file);
    const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
    for (const { fileName: specifier } of importedFiles) {
      if (!ts.isExternalModuleNameRelative(specifier)) {
        const reason = bareEscapeOf(specifier);
        if (reason !== null) escapes.push(`${where}: '${specifier}' ${reason}`);
        continue;
      }
      const named = filesNamed(file, specifier);
      if (named.length === 0) escapes.push(`${where}: '${specifier}' names no file`);
      for (const target of named.filter((candidate) => !seen.has(candidate))) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const outside = unwatched(
    { files: new Set([...read, ...extendedConfigs()]), scanned: new Set() },
    deployWatched(REPO),
  );
  return { read, escapes: [...escapes, ...outside] };
}

describe('what loads before the Enfav site builds', () => {
  it('reads the config it is meant to guard, and what the config imports', () => {
    const { read } = walkTheConfig();

    expect(read.map((file) => relative(SITE, file))).toEqual(
      expect.arrayContaining([
        'astro.config.ts',
        join('integrations', 'watched-inputs.ts'),
        join('src', 'data', 'site.ts'),
      ]),
    );
    expect(extendedConfigs().length).toBeGreaterThan(0);
  });

  it('reads every file a relative specifier could name, and knows when it names none', () => {
    expect(filesNamed(CONFIG, './src/data/site')).toEqual([join(SITE, 'src', 'data', 'site.ts')]);
    expect(filesNamed(CONFIG, './integrations/watched-inputs.js')).toEqual([
      join(SITE, 'integrations', 'watched-inputs.ts'),
    ]);
    expect(filesNamed(CONFIG, './src/missing')).toEqual([]);
  });

  it('tells a bare specifier the workflow sees from one it does not', () => {
    expect(bareEscapeOf('astro:assets')).toBeNull();
    expect(bareEscapeOf('node:path')).toBeNull();
    expect(bareEscapeOf('@astrojs/sitemap')).toBeNull();
    expect(bareEscapeOf('astro/config')).toBeNull();
    expect(bareEscapeOf('@sysdesign/contracts')).toBe('is not a root package.json dependency');
  });

  it('[SITE-6] the config, what it imports and the TypeScript configs it extends lie where the deploy workflow watches', () => {
    const { escapes } = walkTheConfig();

    expect(
      escapes,
      'keep it inside packages/website, or add its path to the workflow and to DEPLOY_PATHS in packages/website/integrations/watched-inputs.ts',
    ).toEqual([]);
  });

  it('[SITE-6] the deploy workflow watches exactly the paths the checks hold the build to', () => {
    expect(workflowPaths().sort()).toEqual(DEPLOY_PATHS.map(workflowEntry).sort());
    // A folder written without /** would watch that one path, not what is under it.
    expect(
      DEPLOY_PATHS.filter(
        ({ path, folder }) => statSync(join(REPO, path)).isDirectory() !== (folder === true),
      ).map(({ path }) => path),
    ).toEqual([]);
  });
});
