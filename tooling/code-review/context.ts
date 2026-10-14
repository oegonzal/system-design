import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { codeReviewExpectations } from './conventions';
import {
  criticFiles,
  hasColocatedSpec,
  packDiff,
  splitDiffByFile,
  type PackedDiff,
} from './diff-pack';
import { changedFiles, git, mergeBase, REPO_ROOT, type Scope } from './git-scope';
import { deriveIntent, readCommitMessages, type Intent } from './intent';

/**
 * What one review is shown: the changed files, their diff packed into the
 * budget, the projects they touch, the policy section the critics are held
 * to and the change's stated purpose — each part in its own module.
 */

export interface ReviewContext {
  /** Reviewable (code) files — what the critics can be shown. */
  files: string[];
  /** Every changed file the rules engine should see, code or not. */
  allFiles: string[];
  packed: PackedDiff;
  /** True when the critics were not shown the whole change. */
  truncated: boolean;
  /** project.json of every project the change touches. */
  projectMetadata: string;
  /** The `## Code Review Expectations` section only. */
  conventions: string;
  intent: Intent;
  /** Non-fatal problems worth surfacing — a duplicated heading, a lost segment. */
  warnings: string[];
  /** Resolved merge base, recorded so a run can be reproduced exactly. */
  base?: string;
}

function projectMetadataFor(files: string[]): string {
  const roots = new Set(
    files
      .map((file) => file.match(/^(packages\/[^/]+)\//)?.[1])
      .filter((root): root is string => Boolean(root)),
  );

  const blocks: string[] = [];
  for (const root of [...roots].sort()) {
    const path = join(REPO_ROOT, root, 'project.json');
    if (!existsSync(path)) continue;
    blocks.push(
      `### ${root}/project.json\n\n\`\`\`json\n${readFileSync(path, 'utf8').trim()}\n\`\`\``,
    );
  }

  return blocks.join('\n\n');
}

/** Whether a file's colocated spec exists on disk, changed or not. */
const specExists = (file: string): boolean =>
  hasColocatedSpec(file, (path) => existsSync(join(REPO_ROOT, path)));

function diffFor(scope: Scope, files: string[], base?: string): string {
  // Every flag here defends the parser against a git config that would change
  // the patch shape: quoted paths, absent or mnemonic prefixes, an external
  // differ, or ANSI colour inside the headers.
  const shape = [
    '--unified=3',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--src-prefix=a/',
    '--dst-prefix=b/',
  ];

  const args =
    scope.kind === 'staged'
      ? ['diff', '--cached', ...shape, '--', ...files]
      : ['diff', ...shape, `${base}...HEAD`, '--', ...files];

  return git(args);
}

export interface BuildOptions {
  budgetChars: number;
  maxFileChars: number;
  /** Overrides the commit-derived purpose. CI supplies the pull request body. */
  intentOverride?: string;
}

export function buildReviewContext(scope: Scope, options: BuildOptions): ReviewContext {
  // Resolved once, so the file list, the diff and the purpose provably describe
  // the same range.
  const base = scope.kind === 'base' ? mergeBase(scope.ref) : undefined;
  const allFiles = changedFiles(scope, base);
  const files = criticFiles(allFiles);
  const { text: conventions, warnings } = codeReviewExpectations(
    readFileSync(join(__dirname, 'review-policy.md'), 'utf8'),
  );

  // No commit message exists before the commit does, so a staged review has no
  // stated purpose — and the guards that need one are disabled for that run.
  const intent = deriveIntent(base ? readCommitMessages(base) : [], options.intentOverride);

  if (files.length === 0) {
    return {
      files,
      allFiles,
      packed: {
        diff: '',
        files: [],
        included: [],
        omitted: [],
        budgetChars: options.budgetChars,
        usedChars: 0,
        complete: true,
      },
      truncated: false,
      projectMetadata: '',
      conventions,
      intent,
      warnings,
      base,
    };
  }

  const { segments, unattributed } = splitDiffByFile(diffFor(scope, files, base), files);
  for (const header of unattributed) {
    warnings.push(`diff segment could not be attributed to a changed file — ${header}`);
  }

  const packed = packDiff(segments, {
    budgetChars: options.budgetChars,
    maxFileChars: options.maxFileChars,
    specExists,
  });

  return {
    files,
    allFiles,
    packed,
    truncated: !packed.complete,
    projectMetadata: projectMetadataFor(files),
    conventions,
    intent,
    warnings,
    base,
  };
}
