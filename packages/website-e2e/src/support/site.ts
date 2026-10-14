import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { workspaceRoot } from '@nx/devkit';

/** What website:build wrote: the suite derives its pages from it rather than from a list. */
export const DIST = join(workspaceRoot, 'packages', 'website', 'dist');

/** A path no page answers on — the 404 page and status. */
export const MISSING = '/this-page-does-not-exist/';

/** What Workers reads from the root of the assets directory as configuration, never serving it. */
const CONFIGURATION = new Set(['_headers', '_redirects', '.assetsignore']);

/** A file the build wrote, and how the site answers for it. */
interface ServedFile {
  file: string;
  /** A page, the page for paths nothing answers, or any other file. */
  kind: 'page' | 'not-found' | 'asset';
  url: string;
  status: number;
}

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

/** How the site answers for one built file, from its path in dist/. */
const served = (file: string): ServedFile => {
  const segments = relative(DIST, file).split(sep);
  const path = segments.join('/');
  if (path === '404.html') return { file, kind: 'not-found', url: MISSING, status: 404 };
  if (segments.at(-1) === 'index.html') {
    const directory = segments.slice(0, -1);
    const url = directory.length === 0 ? '/' : `/${directory.join('/')}/`;
    return { file, kind: 'page', url, status: 200 };
  }
  return { file, kind: 'asset', url: `/${path}`, status: 200 };
};

/**
 * Every file the build wrote that the site serves, at the URL it answers on: a
 * page at its directory (`about/index.html` at `/about/`), the 404 page at any
 * path nothing else answers, and every other file at its own path.
 */
export const servedFiles = (): ServedFile[] =>
  filesUnder(DIST)
    .filter((file) => !CONFIGURATION.has(relative(DIST, file)))
    .map(served);

/** Every page the build produced, as the path it is served on (directory format: `/about/`). */
export const builtPages = (): string[] =>
  servedFiles()
    .filter(({ kind }) => kind === 'page')
    .map(({ url }) => url)
    .sort();
