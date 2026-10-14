import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { workspaceRoot } from '@nx/devkit';

/** What website:build wrote: the suite derives its pages from it rather than from a list. */
export const DIST = join(workspaceRoot, 'packages', 'website', 'dist');

/** A path no page answers on — the 404 page and status. */
export const MISSING = '/this-page-does-not-exist/';

const indexesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return indexesUnder(path);
    return entry === 'index.html' ? [path] : [];
  });

/** Every page the build produced, as the path it is served on (directory format: `/about/`). */
export const builtPages = (): string[] =>
  indexesUnder(DIST)
    .map((file) => relative(DIST, file).split(sep).slice(0, -1))
    .map((segments) => (segments.length === 0 ? '/' : `/${segments.join('/')}/`))
    .sort();
