import { describe, expect, it } from 'vitest';

import { deriveIntent } from './intent';

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
