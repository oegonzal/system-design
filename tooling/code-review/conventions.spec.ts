import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { codeReviewExpectations } from './conventions';

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
