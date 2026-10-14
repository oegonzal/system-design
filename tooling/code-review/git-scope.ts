import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The repository the review reads, whatever directory it was started from. */
export const REPO_ROOT = join(__dirname, '../..');

export type Scope = { kind: 'staged' } | { kind: 'base'; ref: string };

/**
 * `-c core.quotePath=false` on every invocation.
 *
 * With quoting on, `café.ts` arrives as the literal `"caf\303\251.ts"` — which
 * matches no extension filter and cannot be attributed to a diff segment, so
 * the file drops out of the review in silence. That is the same class of bug
 * the `-z` flags below guard against, one layer down. The pre-commit hook makes
 * the identical choice for the identical reason.
 */
export const git = (args: string[]): string =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

/**
 * Paths no review reads. Lockfiles and generated output produce enormous diffs
 * with no reviewable design content, so they are filtered before anything is
 * priced. Every other changed file reaches the rules engine, because the
 * branding tripwire must scan markdown and config too; the critics then read
 * only source files (`SOURCE`, in diff-pack.ts).
 */
const IGNORED = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)\.next\//,
  /(^|\/)storybook-static\//,
  /(^|\/)\.nx\//,
  /pnpm-lock\.yaml$/,
];

const notIgnored = (file: string): boolean => !IGNORED.some((pattern) => pattern.test(file));

/**
 * NUL-delimited, because `--name-only` alone makes git *quote* any path holding
 * non-ASCII bytes. `-z` disables the quoting entirely.
 */
export function changedFiles(scope: Scope, base?: string): string[] {
  const raw =
    scope.kind === 'staged'
      ? git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
      : git(['diff', '--name-only', '-z', '--diff-filter=ACMR', `${base}...HEAD`]);

  return raw.split('\0').filter(Boolean).filter(notIgnored);
}

/**
 * The merge base, so a review covers what this branch adds rather than
 * everything that has landed on the base branch since it forked.
 */
export function mergeBase(ref: string): string {
  return git(['merge-base', ref, 'HEAD']).trim();
}

/**
 * The content of a changed file *as the review scope sees it*.
 *
 * The distinction matters for the rules engine: a staged review must judge the
 * staged content, not whatever else is sitting in the worktree — the pre-commit
 * hook deliberately leaves partially-staged files unformatted for the same
 * reason. `undefined` means the blob could not be read (renamed-and-gone,
 * or a repository state this tool has no business guessing about), and every
 * rule treats that as "nothing to scan" rather than as an empty file.
 */
export function readChangedFile(scope: Scope, file: string): string | undefined {
  try {
    return scope.kind === 'staged' ? git(['show', `:${file}`]) : git(['show', `HEAD:${file}`]);
  } catch {
    try {
      return readFileSync(join(REPO_ROOT, file), 'utf8');
    } catch {
      return undefined;
    }
  }
}
