import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { readAstro } from './astro-sources';

/**
 * Everything the Enfav site's build follows stays where its deploy workflow
 * looks.
 *
 * .github/workflows/deploy-website.yml decides whether a push to main changes
 * the site from a list of paths: packages/website, and the root files that pin
 * its toolchain and dependencies. That list is complete only while every
 * module the build can reach is inside the package or is a dependency the root
 * manifest declares; a workspace package or a relative path out of the package
 * would change the site without deploying it. Scripts are read by the
 * TypeScript compiler's scanner and components by Astro's compiler. A
 * stylesheet's `@import` is not followed.
 */
const REPO = join(__dirname, '..');
const SITE = join(REPO, 'packages', 'website');

/** What the build reads: the sources, and the configs that shape its output. */
const BUILD_INPUTS = ['src', 'astro.config.ts', 'postcss.config.mjs'];

/** Specifier schemes the build resolves itself, never from node_modules. */
const BUILT_IN_SCHEMES = new Set(['astro:', 'node:']);

/** How each kind of build input names its modules. A file of any other kind names none. */
const READERS: Record<string, (path: string, source: string) => string[]> = {
  '.astro': (path, source) => {
    const { imports, errors } = readAstro(source);
    if (errors.length > 0) throw new Error(`${path}: ${errors.join('; ')}`);
    return imports;
  },
  '.ts': (_, source) => scriptImports(source),
  '.mts': (_, source) => scriptImports(source),
  '.js': (_, source) => scriptImports(source),
  '.mjs': (_, source) => scriptImports(source),
};

function scriptImports(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
}

const manifest = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const DECLARED = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);

const filesUnder = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((entry) => filesUnder(join(path, entry)))
    : [path];

const isInside = (directory: string, path: string): boolean => {
  const route = relative(directory, path);
  return !isAbsolute(route) && route.split(sep)[0] !== '..';
};

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

/** Why an import escapes what the deploy workflow watches, or null when it does not. */
function escapeOf(file: string, specifier: string): string | null {
  if (ts.isExternalModuleNameRelative(specifier)) {
    return isInside(SITE, resolve(dirname(file), specifier))
      ? null
      : 'reaches outside packages/website';
  }
  if (BUILT_IN_SCHEMES.has(schemeOf(specifier) ?? '')) return null;
  return dependencyOf(specifier) === undefined ? 'is not a root package.json dependency' : null;
}

describe('what the Enfav site imports', () => {
  const files = BUILD_INPUTS.flatMap((input) => filesUnder(join(SITE, input)));
  const read = files.filter((file) => READERS[extname(file)] !== undefined);

  it('reads the site it is meant to guard', () => {
    expect(read.filter((file) => extname(file) === '.astro').length).toBeGreaterThan(5);
    expect(read.filter((file) => extname(file) === '.ts').length).toBeGreaterThan(5);
  });

  it('tells an escaping import from one the workflow sees', () => {
    const page = join(SITE, 'src', 'pages', 'index.astro');
    expect(escapeOf(page, '../components/Header.astro')).toBeNull();
    expect(escapeOf(page, 'astro:assets')).toBeNull();
    expect(escapeOf(page, 'node:path')).toBeNull();
    expect(escapeOf(page, '@astrojs/sitemap')).toBeNull();
    expect(escapeOf(page, 'astro/config')).toBeNull();
    expect(escapeOf(page, '../../../criteria/src')).toBe('reaches outside packages/website');
    expect(escapeOf(page, '@sysdesign/contracts')).toBe('is not a root package.json dependency');
  });

  it('[SITE-6] imports nothing the deploy workflow cannot see change', () => {
    const escapes = read.flatMap((file) => {
      const reader = READERS[extname(file)];
      const specifiers = reader === undefined ? [] : reader(file, readFileSync(file, 'utf8'));
      return specifiers.flatMap((specifier) => {
        const reason = escapeOf(file, specifier);
        return reason === null ? [] : [`${relative(SITE, file)}: '${specifier}' ${reason}`];
      });
    });

    expect(
      escapes,
      'add the path to .github/workflows/deploy-website.yml `paths` before importing it',
    ).toEqual([]);
  });
});
