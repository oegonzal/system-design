import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOURCE } from './code-review/diff-pack';
import { LINE_BOUNDS, lineCount } from './code-review/rules/file-size';

/**
 * No source file in the repository is longer than the bound the review
 * refuses at commit time — the same bound and the same count, read from the
 * rule that declares them, over every tracked file rather than over the files
 * one commit changed. A file split by responsibility stays readable; a file
 * that grew past this has more than one reason to change.
 */
const REPO = join(__dirname, '..');

/** Tracked source files, as git lists them: what the repository is, not what a checkout holds. */
const trackedSources = (): string[] =>
  execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', '-z'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter((file) => SOURCE.test(file) && existsSync(join(REPO, file)));

describe('file size', () => {
  it(`keeps every tracked source file at or under ${LINE_BOUNDS.max} lines`, () => {
    const files = trackedSources();
    const over = files
      .map((file) => ({ file, lines: lineCount(readFileSync(join(REPO, file), 'utf8')) }))
      .filter(({ lines }) => lines > LINE_BOUNDS.max)
      .map(({ file, lines }) => `${file}: ${lines} lines`);

    expect(files.length).toBeGreaterThan(0);
    expect(over).toEqual([]);
  });
});
