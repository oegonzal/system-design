import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { deployWatched, unwatched } from './watched-inputs';

/** Throwaway folders: a repository laid out as this one is, and a place outside it. */
const SCRATCH = mkdtempSync(join(tmpdir(), 'watched-inputs-'));
const REPOSITORY = join(SCRATCH, 'repository');
const OUTSIDE = join(SCRATCH, 'outside');
const at = (path: string): string => join(REPOSITORY, path);
const write = (path: string, text = ''): string => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};

write(at('.gitignore'));
write(at('package.json'), '{}');
const page = write(at('packages/website/src/pages/index.astro'));
const installed = write(at('node_modules/.pnpm/tailwindcss@4/node_modules/tailwindcss/index.css'));
const shared = write(at('packages/design-system/tokens.css'));
mkdirSync(at('packages/design-system/src'), { recursive: true });

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

describe('the build’s inputs, against what the deploy workflow watches', () => {
  it('[SITE-6] accepts the package, node_modules and the root files the workflow watches', () => {
    expect(
      unwatched(
        {
          files: new Set([page, installed, at('package.json')]),
          scanned: new Set([at('packages/website/src')]),
        },
        deployWatched(REPOSITORY),
      ),
    ).toEqual([]);
  });

  it('[SITE-6] names a file read, or a folder scanned, outside them', () => {
    expect(
      unwatched(
        { files: new Set([page, shared]), scanned: new Set([at('packages/design-system/src')]) },
        deployWatched(REPOSITORY),
      ),
    ).toEqual(['reads packages/design-system/tokens.css', 'scans packages/design-system/src']);
  });

  it('[SITE-6] names the repository root as .', () => {
    expect(
      unwatched({ files: new Set(), scanned: new Set([REPOSITORY]) }, deployWatched(REPOSITORY)),
    ).toContain('scans .');
  });

  it('[SITE-6] accepts a package pnpm links from a virtual store outside the repository', () => {
    const linked = write(join(OUTSIDE, 'store', 'pkg@1', 'node_modules', 'pkg', 'index.js'));
    // As pnpm records it: relative to node_modules.
    write(
      at('node_modules/.modules.yaml'),
      JSON.stringify({ virtualStoreDir: relative(at('node_modules'), join(OUTSIDE, 'store')) }),
    );

    expect(
      unwatched({ files: new Set([linked]), scanned: new Set() }, deployWatched(REPOSITORY)),
    ).toEqual([]);
  });

  it('[SITE-6] judges a symlinked path by where it leads', () => {
    symlinkSync(at('packages/design-system'), at('packages/website/src/linked'));

    expect(
      unwatched(
        { files: new Set([at('packages/website/src/linked/tokens.css')]), scanned: new Set() },
        deployWatched(REPOSITORY),
      ),
    ).toEqual(['reads packages/design-system/tokens.css']);
  });

  it('[SITE-6] names an ignore file above a scanned folder that the workflow does not watch', () => {
    write(at('packages/.gitignore'));
    write(at('.ignore'));
    write(at('packages/website/src/.gitignore'));

    expect(
      unwatched(
        { files: new Set(), scanned: new Set([at('packages/website/src')]) },
        deployWatched(REPOSITORY),
      ),
    ).toEqual(['honours .ignore', 'honours packages/.gitignore']);
  });
});
