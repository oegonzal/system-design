import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

/**
 * The build checks what its tools report reading against what the deploy
 * workflow watches.
 *
 * A build that read anything outside .github/workflows/deploy-website.yml's
 * `paths` would change the site on a push that starts no deploy. So the build
 * records what its tools report: every module Rolldown loads (pages,
 * components and their scripts, data, a glob's matches), the modules Astro's
 * content sync loads among them (the content config and what it imports);
 * every file and folder PostCSS plugins report (a stylesheet an `@import` or
 * `@reference` brings in, a `@plugin` or `@config` module, each file and folder
 * Tailwind's class scan reads); the source of every asset a stylesheet's
 * `url()` emits; and every file Vite copies from the public folder, symlinks
 * resolved. It fails when one lies outside the watched paths, or when a
 * .gitignore or .ignore between a folder Tailwind scans and the repository
 * root is not watched, since the scan honours those.
 *
 * Some reads reach no report this build can read, so nothing here sees them:
 * what loads before the build (astro.config.ts and what it imports,
 * tsconfig.json and what it extends, which tooling/website-imports.spec.ts
 * walks), a content collection's entries (its loader reads them itself), a
 * font file the config names, a stylesheet a CSS preprocessor (Sass, Less,
 * Stylus) loads itself through `@use`, `@forward` or `@import`, and a file a
 * page or the config opens with node:fs. Keep each such input inside the
 * package. CSS Modules would be another: postcss-modules reads the file a
 * `composes … from` names itself. The site keeps them off, and this
 * integration fails the build if Vite's resolved config turns them on.
 * Tailwind's scan also honours the exclude file git reads (`git rev-parse
 * --git-path info/exclude`: .git/info/exclude in a clone, the main checkout's
 * in a linked worktree) and any .ignore above the checkout; no push can change
 * those and CI's checkout has neither, but they change a local build.
 */

/**
 * What the deploy workflow's `paths` watch, relative to the repository: a
 * folder with everything under it, which the workflow writes as `<folder>/**`,
 * or one file, written as it is; and what else watching a path covers, since
 * pnpm-lock.yaml fixes every file installed under node_modules. No row can
 * express a negation, and tooling/website-imports.spec.ts fails unless the
 * workflow lists exactly these entries.
 */
export const DEPLOY_PATHS: readonly {
  readonly path: string;
  readonly folder?: true;
  readonly alsoCovers?: readonly string[];
}[] = [
  { path: 'packages/website', folder: true },
  { path: '.gitignore' },
  { path: 'package.json' },
  { path: 'pnpm-lock.yaml', alsoCovers: ['node_modules'] },
  { path: 'pnpm-workspace.yaml' },
  { path: '.nvmrc' },
  { path: 'nx.json' },
  { path: '.github/workflows/deploy-website.yml' },
];

/** A watched path as the deploy workflow's `paths` write it. */
export const workflowEntry = ({ path, folder }: (typeof DEPLOY_PATHS)[number]): string =>
  folder === true ? `${path}/**` : path;

/** What a build read, as its tools reported it. */
interface BuildRecord {
  readonly files: ReadonlySet<string>;
  /** The folders Tailwind's class scan reads. */
  readonly scanned: ReadonlySet<string>;
}

/** Where the deploy workflow's paths reach in one repository: each path covers itself and everything under it. */
interface Watched {
  readonly repository: string;
  readonly paths: readonly string[];
}

/** A PostCSS message, as plugins report a file or a folder they read. */
interface Message {
  readonly type: string;
  readonly file?: string;
  readonly dir?: string;
}

/** The file names Tailwind's scanner honours as ignore lists in a folder: git's, and its own `.ignore`. */
const IGNORE_FILES = ['.gitignore', '.ignore'];

/**
 * A path as the file system resolves it, so a symlinked folder compares as its
 * target. A path that does not exist yet resolves through its nearest folder that does.
 */
function real(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return parent === absolute ? absolute : join(real(parent), basename(absolute));
}

const isInside = (folder: string, path: string): boolean => {
  const route = relative(folder, path);
  return !isAbsolute(route) && route.split(sep)[0] !== '..';
};

/**
 * The folder pnpm links installed packages from: node_modules/.pnpm unless
 * `virtualStoreDir` or `enableGlobalVirtualStore` moved it, outside the
 * repository too. pnpm's record of the install (node_modules/.modules.yaml,
 * which it writes as JSON) names it, relative to node_modules.
 */
function virtualStore(repository: string): string[] {
  const modules = join(repository, 'node_modules');
  const record = join(modules, '.modules.yaml');
  if (!existsSync(record)) return [];
  const { virtualStoreDir } = JSON.parse(readFileSync(record, 'utf8')) as {
    virtualStoreDir?: string;
  };
  return virtualStoreDir === undefined ? [] : [resolve(modules, virtualStoreDir)];
}

/** What the deploy workflow watches in a repository laid out as this one is. */
export function deployWatched(repository: string): Watched {
  return {
    repository,
    paths: [
      ...DEPLOY_PATHS.flatMap(({ path, alsoCovers = [] }) =>
        [path, ...alsoCovers].map((covered) => join(repository, covered)),
      ),
      ...virtualStore(repository),
    ],
  };
}

/** A folder and each folder above it, up to and including the repository root. */
function foldersUp(folder: string, repository: string): string[] {
  if (!isInside(repository, folder)) return [];
  const parent = dirname(folder);
  return [folder, ...(folder === repository ? [] : foldersUp(parent, repository))];
}

/** Every input in the record that the deploy workflow does not watch, sorted, as a person would fix it. */
export function unwatched(record: BuildRecord, watched: Watched): string[] {
  const repository = real(watched.repository);
  const paths = watched.paths.map(real);
  const covered = (path: string): boolean =>
    paths.some((watchedPath) => isInside(watchedPath, path));
  const named = (path: string): string =>
    isInside(repository, path) ? relative(repository, path) || '.' : path;
  const scanned = [...record.scanned].map(real);
  const ignoreFiles = scanned
    .flatMap((folder) => foldersUp(folder, repository))
    .flatMap((folder) => IGNORE_FILES.map((name) => join(folder, name)))
    .filter((file) => existsSync(file));
  return [
    ...new Set([
      ...[...record.files]
        .map(real)
        .filter((path) => !covered(path))
        .map((path) => `reads ${named(path)}`),
      ...scanned.filter((path) => !covered(path)).map((path) => `scans ${named(path)}`),
      ...ignoreFiles.filter((path) => !covered(path)).map((path) => `honours ${named(path)}`),
    ]),
  ].sort();
}

/** The file a module id names, without its query; undefined for a virtual module or a bare package name. */
function fileOf(id: string): string | undefined {
  const [path = ''] = id.split('?');
  return isAbsolute(path) && existsSync(path) ? path : undefined;
}

/** Every file under a folder, following symlinks, each folder walked once. */
function filesUnder(folder: string, walked = new Set<string>()): string[] {
  const target = real(folder);
  if (walked.has(target)) return [];
  walked.add(target);
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    return statSync(path).isDirectory() ? filesUnder(path, walked) : [path];
  });
}

/**
 * Records what the build's tools report reading and fails the build when an
 * input lies outside what the deploy workflow watches. Builds only: `astro dev`
 * records nothing.
 */
export function watchedInputs(): AstroIntegration {
  const files = new Set<string>();
  const scanned = new Set<string>();
  let site = '';
  let publicFolder = '';
  return {
    name: 'enfav:watched-inputs',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig }) => {
        // Vite reads no postcss.config file once vite.css.postcss is an object, so
        // plugins declared in one would run in astro dev and silently not in a build.
        if (typeof config.vite.css?.postcss !== 'object') {
          throw new Error(
            "watchedInputs appends its recorder to vite.css.postcss.plugins: declare the site's PostCSS plugins there, in astro.config.ts.",
          );
        }
        if (command !== 'build') return;
        site = fileURLToPath(config.root);
        const recorder = {
          postcssPlugin: 'enfav:record-css-inputs',
          OnceExit(_root: unknown, { result }: { result: { messages: Message[] } }) {
            for (const { type, file, dir } of result.messages) {
              if (type === 'dependency' && file !== undefined) files.add(file);
              if (type === 'dir-dependency' && dir !== undefined) scanned.add(dir);
            }
          },
        };
        updateConfig({
          vite: {
            // Appended to the plugins the site declares, so it reads the messages all of them left.
            css: { postcss: { plugins: [recorder] } },
            plugins: [
              {
                name: 'enfav:record-inputs',
                // Astro's content sync loads the content config in a Vite server of its
                // own before the build; this has that server's buildEnd record it too.
                perEnvironmentStartEndDuringDev: true,
                // The config Vite resolved, once every integration and plugin has set its part.
                configResolved({ publicDir, build, css }) {
                  if (css.modules !== false) {
                    throw new Error(
                      'watchedInputs needs vite.css.modules set to false: postcss-modules reads the file a `composes … from` names itself, and reports none it reads.',
                    );
                  }
                  if (typeof css.postcss !== 'object' || !css.postcss.plugins?.includes(recorder)) {
                    throw new Error(
                      'watchedInputs found its recorder gone from vite.css.postcss.plugins: something after it replaced the PostCSS config.',
                    );
                  }
                  if (build.copyPublicDir) publicFolder = publicDir;
                },
                buildEnd() {
                  for (const id of this.getModuleIds()) {
                    const file = fileOf(id);
                    if (file !== undefined) files.add(file);
                  }
                },
                generateBundle(_options, bundle) {
                  for (const output of Object.values(bundle)) {
                    if (output.type !== 'asset') continue;
                    for (const name of output.originalFileNames) {
                      // A virtual module's name is no file the build read.
                      const file = resolve(site, name);
                      if (existsSync(file)) files.add(file);
                    }
                  }
                },
              },
            ],
          },
        });
      },
      'astro:build:done': () => {
        if (publicFolder !== '' && existsSync(publicFolder)) {
          for (const file of filesUnder(publicFolder)) files.add(file);
        }
        // The site sits at packages/website in the repository.
        const escapes = unwatched({ files, scanned }, deployWatched(resolve(site, '..', '..')));
        if (escapes.length > 0) {
          throw new Error(
            [
              'The build read what .github/workflows/deploy-website.yml does not watch,',
              'so a change to it would never deploy:',
              ...escapes.map((escape) => `  ${escape}`),
              'Keep it inside packages/website, or add its path to the workflow and to',
              'DEPLOY_PATHS in packages/website/integrations/watched-inputs.ts.',
            ].join('\n'),
          );
        }
      },
    },
  };
}
