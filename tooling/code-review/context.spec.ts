import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  bundleKey,
  codeReviewExpectations,
  deriveIntent,
  packDiff,
  splitDiffByFile,
  truncateAtHunkBoundary,
  type FileDiff,
} from './context';

/**
 * Context assembly is where a review silently stops being a review: a file
 * dropped here is a file no critic can report on, and the pipeline reports
 * success either way. So the splitting, bundling and packing invariants are
 * pinned directly, not just exercised through a live run.
 */
const hunk = (n: number, size = 3) =>
  `@@ -${n},${size} +${n},${size} @@\n${Array.from({ length: size }, (_, i) => `+line ${n}-${i}`).join('\n')}\n`;

const segment = (file: string, hunks = 1, size = 3): FileDiff => {
  const body = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${Array.from(
    { length: hunks },
    (_, i) => hunk(i + 1, size),
  ).join('')}`;
  return { file, body, added: hunks * size, removed: 0 };
};

const pack = (segments: FileDiff[], budgetChars: number, maxFileChars = 1_000_000) =>
  packDiff(segments, { budgetChars, maxFileChars, specExists: () => false });

describe('splitDiffByFile', () => {
  it('attributes each segment to its path', () => {
    const diff = [segment('a.ts'), segment('b.ts')].map((s) => s.body).join('');
    const { segments, unattributed } = splitDiffByFile(diff, ['a.ts', 'b.ts']);

    expect(segments.map((s) => s.file)).toEqual(['a.ts', 'b.ts']);
    expect(unattributed).toEqual([]);
  });

  /**
   * Safe because every diff *body* line carries a one-character prefix, so a
   * file containing the literal text renders as `+diff --git`.
   */
  it('does not split on a body line that happens to say "diff --git"', () => {
    const body = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n+diff --git a/x b/x\n`;
    const { segments } = splitDiffByFile(body, ['a.ts']);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.body).toContain('+diff --git a/x b/x');
  });

  it('handles a path containing a space', () => {
    const { segments } = splitDiffByFile(segment('a b.ts').body, ['a b.ts']);
    expect(segments.map((s) => s.file)).toEqual(['a b.ts']);
  });

  /** Silent file loss is the failure mode this parser exists to prevent. */
  it('reports a segment it cannot attribute rather than swallowing it', () => {
    const { segments, unattributed } = splitDiffByFile(segment('ghost.ts').body, ['a.ts']);

    expect(segments).toEqual([]);
    expect(unattributed).toHaveLength(1);
    expect(unattributed[0]).toContain('ghost.ts');
  });

  it('counts added and removed lines without counting the file headers', () => {
    const [only] = splitDiffByFile(segment('a.ts', 1, 2).body, ['a.ts']).segments;
    expect(only?.added).toBe(2);
    expect(only?.removed).toBe(0);
  });
});

describe('bundleKey', () => {
  it('gives a source file and its colocated spec the same key', () => {
    expect(bundleKey('x/foo.ts')).toBe(bundleKey('x/foo.spec.ts'));
    expect(bundleKey('x/foo.tsx')).toBe(bundleKey('x/foo.spec.tsx'));
  });

  it('keeps stories separate, because omitting one cannot invent a finding', () => {
    expect(bundleKey('x/foo.stories.tsx')).not.toBe(bundleKey('x/foo.tsx'));
  });

  it('does not merge files that merely share a directory', () => {
    expect(bundleKey('x/foo.ts')).not.toBe(bundleKey('x/bar.ts'));
  });
});

describe('packDiff', () => {
  /**
   * The headline property. "Source before specs" applied to *files* omits every
   * spec once the budget runs out, which shows the testability critic a
   * monorepo of untested code and invites a false `missing-test` on every file.
   */
  it('never shows a source file without its colocated spec', () => {
    const source = segment('x/foo.ts', 4);
    const spec = segment('x/foo.spec.ts', 4);
    const budget = source.body.length + 10; // room for the source alone, not the pair

    const packed = pack([source, spec], budget);
    const statuses = packed.files.map((f) => f.status);

    expect(new Set(statuses).size).toBe(1);
    expect(packed.included).toEqual([]);
  });

  it('includes the pair when the budget fits both', () => {
    const source = segment('x/foo.ts');
    const spec = segment('x/foo.spec.ts');
    const packed = pack([source, spec], source.body.length + spec.body.length);

    expect(packed.included).toEqual(['x/foo.spec.ts', 'x/foo.ts']);
    expect(packed.complete).toBe(true);
  });

  it('drops stories before source, and config last of all', () => {
    const packed = pack(
      [segment('a.config.mjs'), segment('b.stories.tsx'), segment('c.ts')],
      segment('c.ts').body.length,
    );

    expect(packed.included).toEqual(['c.ts']);
    expect(packed.omitted).toEqual(['a.config.mjs', 'b.stories.tsx']);
  });

  /**
   * Ascending size within a tier: git emits by path, so a path-ordered fill
   * would let the alphabetically-early packages starve the late ones out of
   * every review.
   */
  it('prefers more files over earlier paths', () => {
    const big = segment('a-big.ts', 40);
    const small1 = segment('b-small.ts', 1);
    const small2 = segment('c-small.ts', 1);

    const packed = pack([big, small1, small2], small1.body.length + small2.body.length + 10);
    expect(packed.included).toEqual(['b-small.ts', 'c-small.ts']);
  });

  it('emits in repo-path order even though it packs smallest first', () => {
    const packed = pack([segment('z.ts', 1), segment('a.ts', 4)], 1_000_000);
    expect(packed.included).toEqual(['a.ts', 'z.ts']);
    expect(packed.diff.indexOf('a/a.ts')).toBeLessThan(packed.diff.indexOf('a/z.ts'));
  });

  it('never emits a body cut mid-hunk', () => {
    const packed = pack([segment('a.ts', 6)], 1_000_000, 200);
    const shown = packed.files[0];

    expect(shown?.status).toBe('partial');
    // Every `@@` that opens a hunk is matched by its lines; a mid-hunk cut
    // would leave a trailing fragment with no marker.
    expect(packed.diff).toContain('[remaining hunks not shown]');
    expect(packed.diff.endsWith('\n')).toBe(true);
  });

  /**
   * A newly added file is a single hunk, so the hunk boundary is no help.
   * Omitting the file entirely would split it from the source it tests — the
   * per-file cap must degrade to whole lines, never to absence.
   */
  it('falls back to whole lines when not even the first hunk fits', () => {
    const packed = pack([segment('a.ts', 1, 200)], 1_000_000, 400);

    expect(packed.files[0]?.status).toBe('partial');
    expect(packed.diff).toContain('lines not shown]');
  });

  /**
   * A spec a few characters over the per-file cap must not be omitted while
   * its source is shown — a capped file is still a file the critic can see,
   * so no absence is implied.
   */
  it('never splits a bundle because one member hits the per-file cap', () => {
    const source = segment('x/foo.ts', 1, 2);
    const spec = segment('x/foo.spec.ts', 1, 400);

    const packed = pack([source, spec], 1_000_000, 300);

    expect(packed.omitted).toEqual([]);
    expect(packed.files.find((f) => f.file === 'x/foo.spec.ts')?.status).toBe('partial');
  });

  it('stays inside the budget', () => {
    const segments = Array.from({ length: 30 }, (_, i) => segment(`f${i}.ts`, (i % 5) + 1));
    const packed = pack(segments, 4_000);
    expect(packed.usedChars).toBeLessThanOrEqual(4_000);
  });

  it('is deterministic', () => {
    const segments = Array.from({ length: 12 }, (_, i) => segment(`f${i}.ts`, (i % 4) + 1));
    expect(pack(segments, 3_000)).toEqual(pack(segments, 3_000));
  });

  it('partitions the change set exactly', () => {
    const segments = Array.from({ length: 10 }, (_, i) => segment(`f${i}.ts`, i + 1));
    const packed = pack(segments, 2_000);

    expect([...packed.included, ...packed.omitted].sort()).toEqual(
      segments.map((s) => s.file).sort(),
    );
  });
});

describe('truncateAtHunkBoundary', () => {
  it('returns null when not even one hunk fits', () => {
    expect(truncateAtHunkBoundary(segment('a.ts', 1, 100).body, 20)).toBeNull();
  });

  it('keeps whole hunks and says what it left out', () => {
    const kept = truncateAtHunkBoundary(segment('a.ts', 5).body, 200);
    expect(kept).toContain('[remaining hunks not shown]');
  });
});

describe('codeReviewExpectations', () => {
  it('extracts the section and stops at the next heading of the same level', () => {
    const { text } = codeReviewExpectations(
      '# T\n\n## Code Review Expectations\n\nkeep me\n\n## Styling\n\ndrop me\n',
    );
    expect(text).toContain('keep me');
    expect(text).not.toContain('drop me');
  });

  it('does not stop at a deeper heading', () => {
    const { text } = codeReviewExpectations(
      '## Code Review Expectations\n\nkeep me\n\n### Detail\n\nkeep me too\n',
    );
    expect(text).toContain('keep me too');
  });

  /** A fenced example containing `##` must not truncate the section. */
  it('ignores headings inside a fenced block', () => {
    const { text } = codeReviewExpectations(
      '## Code Review Expectations\n\n```md\n## Not A Heading\n```\n\nkeep me\n',
    );
    expect(text).toContain('keep me');
  });

  it('concatenates duplicate headings and warns, rather than picking a winner', () => {
    const { text, warnings } = codeReviewExpectations(
      '## Code Review Expectations\n\nfirst\n\n## Other\n\nx\n\n## Code Review Expectations\n\nsecond\n',
    );

    expect(text).toContain('first');
    expect(text).toContain('second');
    expect(warnings[0]).toContain('2 times');
  });

  /** Following repo-map.ts: refuse to run rather than invent a rule set. */
  it('throws when the section is missing', () => {
    expect(() => codeReviewExpectations('# T\n\n## Styling\n\nx\n')).toThrow(/Code Review/);
  });

  /**
   * A canary over the real file: if someone deletes the section the pipeline
   * reads its policy from, this fails loudly rather than at review time — and
   * the human commentary around the section must never leak into a prompt.
   */
  it('finds the section in review-policy.md, exactly once, without the commentary', () => {
    const { text, warnings } = codeReviewExpectations(
      readFileSync(join(__dirname, 'review-policy.md'), 'utf8'),
    );

    expect(text).toContain('boundaries');
    expect(text).not.toContain('commentary for humans');
    expect(warnings).toEqual([]);
  });
});

describe('deriveIntent', () => {
  const commits = [
    'feat: add the thing\n\nA body explaining why the thing was added at some length.',
    'fix: correct the thing\n\nAnother body.\n\nCo-Authored-By: Someone <a@b.c>',
  ];

  it('lists every subject, oldest first', () => {
    const intent = deriveIntent(commits);
    expect(intent.source).toBe('commits');
    expect(intent.text.indexOf('add the thing')).toBeLessThan(
      intent.text.indexOf('correct the thing'),
    );
  });

  it('strips trailers and tool signatures', () => {
    expect(deriveIntent(commits).text).not.toContain('Co-Authored-By');
    expect(
      deriveIntent(['feat: x\n\n🤖 Generated with tooling\n\nreal body here now']).text,
    ).not.toContain('🤖');
  });

  /** Truncating a flat concatenation sheds the later subjects, which is the wrong half. */
  it('keeps every subject when the budget forces bodies out', () => {
    const long = Array.from(
      { length: 8 },
      (_, i) => `feat: subject number ${i}\n\n${'body '.repeat(200)}`,
    );
    const intent = deriveIntent(long, undefined, 600);

    expect(intent.truncated).toBe(true);
    for (let i = 0; i < 8; i += 1) expect(intent.text).toContain(`subject number ${i}`);
  });

  it('lets an explicit override win over commit archaeology', () => {
    const intent = deriveIntent(commits, 'The pull request description, which is the real intent.');
    expect(intent.source).toBe('env');
    expect(intent.text).toContain('pull request description');
  });

  it('reports no purpose when there are no commits', () => {
    expect(deriveIntent([]).source).toBe('none');
  });

  /**
   * A branch of `wip:` commits is worse than nothing: it anchors the critic to a
   * baseline that means nothing, where an absent purpose correctly disables the
   * judgements that need one.
   */
  it('treats a substance-free purpose as absent', () => {
    expect(deriveIntent(['wip', 'wip', 'wip']).source).toBe('none');
    expect(deriveIntent([], 'wip').source).toBe('none');
  });
});
