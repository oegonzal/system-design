import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every source file a project holds is type-checked by its `typecheck`
 * target — specs and stories included — as a gate.
 *
 * A spec is run by vitest, which strips types and checks none, so a spec
 * whose types are wrong still passes. Only the typecheck target can say so,
 * and only for the files its configs include: on 2026-10-14 ten projects
 * checked their library config alone, 157 files were never checked, and five
 * type errors had sat in them since 2026-10-02 with every gate green.
 *
 * The decision is mechanical. A project's target names its configs as
 * `tsc --noEmit -p <config>`; the compiler's own reader resolves each one's
 * include and exclude to files; every TypeScript file under the project's
 * `src` must be among them. A project with no explicit target is held to the
 * same rule, and fails it: the inferred target checks the library config
 * alone.
 */
const REPO = join(__dirname, '..');
const PACKAGES = join(REPO, 'packages');
const SKIP = new Set(['node_modules', 'dist', '.next', '.next-dev', '.next-e2e']);

const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });

interface TypecheckTarget {
  options?: { command?: string; commands?: string[] };
}

/** The configs a project's own typecheck target names; none when it declares no target. */
const checkedConfigs = (projectDir: string): string[] => {
  const project = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8')) as {
    targets?: { typecheck?: TypecheckTarget };
  };
  const options = project.targets?.typecheck?.options;
  const commands = options?.commands ?? (options?.command === undefined ? [] : [options.command]);
  return commands.flatMap((command) =>
    [...command.matchAll(/-p\s+(\S+)/g)].map((match) => match[1] ?? ''),
  );
};

/** Every file a config includes, as the compiler resolves it. */
const filesOf = (configPath: string): string[] => {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error)
    throw new Error(
      `${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`,
    );
  return ts
    .parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath))
    .fileNames.map((file) => resolve(file));
};

const projects = readdirSync(PACKAGES)
  .map((name) => join(PACKAGES, name))
  .filter((dir) => existsSync(join(dir, 'project.json')) && existsSync(join(dir, 'src')));

describe('the typecheck gate', () => {
  it('has projects to hold to it', () => {
    expect(projects.length).toBeGreaterThan(10);
  });

  it.each(projects.map((dir) => [relative(REPO, dir), dir]))(
    '%s type-checks every source file it holds',
    (_name, dir) => {
      const configs = checkedConfigs(dir);
      expect(
        configs,
        'a typecheck target naming its configs as `tsc --noEmit -p <config>`',
      ).not.toEqual([]);
      const covered = new Set(configs.flatMap((config) => filesOf(resolve(dir, config))));
      const unchecked = sourcesUnder(join(dir, 'src'))
        .filter((file) => !covered.has(resolve(file)))
        .map((file) => relative(dir, file));
      expect(unchecked).toEqual([]);
    },
  );
});
