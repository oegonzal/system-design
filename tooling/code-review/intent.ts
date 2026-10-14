import { git } from './git-scope';

/** The change's stated purpose: what its commits say it was for, within a budget, or an override. */

export interface Intent {
  /** Empty when unavailable. */
  text: string;
  source: 'env' | 'commits' | 'none';
  commitCount: number;
  truncated: boolean;
}

export const MAX_INTENT_CHARS = 4_000;

/** Trailers and tool signatures say nothing about what the change was for. */
const NOISE = /^(Co-[Aa]uthored-[Bb]y|Signed-off-by|Change-Id|Reviewed-by):|^🤖 Generated with/;

/**
 * A branch of `wip:` commits is worse than no purpose at all: it anchors the
 * critic to a baseline that means nothing, where an absent purpose correctly
 * disables the judgements that need one.
 */
const isSubstantive = (text: string): boolean =>
  text.replace(/\bwip\b/gi, '').replace(/[^a-z]/gi, '').length >= 24;

/** The git call. Kept separate so `deriveIntent` is testable without a repo. */
export function readCommitMessages(base: string): string[] {
  // --reverse: the first commit states the goal, the last states a fix.
  // %x00: commit bodies contain blank lines, so no textual separator is safe.
  const raw = git(['log', '--reverse', '--no-merges', '--format=%B%x00', `${base}..HEAD`]);
  return raw
    .split('\0')
    .map((message) => message.trim())
    .filter(Boolean);
}

/**
 * Assembles the purpose within a character budget.
 *
 * Two passes, and the order matters: every subject line first, then bodies
 * oldest-first while budget remains. Truncating a flat concatenation would shed
 * the *later* subjects, which is the half that says where the branch ended up.
 */
export function deriveIntent(
  commits: string[],
  override?: string,
  maxChars = MAX_INTENT_CHARS,
): Intent {
  // A pull request description is the author's stated intent; commit messages
  // are archaeology. So the override wins.
  const supplied = override?.trim();
  if (supplied && isSubstantive(supplied)) {
    return {
      text: supplied.slice(0, maxChars),
      source: 'env',
      commitCount: 0,
      truncated: supplied.length > maxChars,
    };
  }

  const cleaned = commits
    .map((message) =>
      message
        .split('\n')
        .filter((line) => !NOISE.test(line.trim()))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);

  if (cleaned.length === 0) return { text: '', source: 'none', commitCount: 0, truncated: false };

  const subjects = cleaned.map((message) => message.split('\n')[0] ?? '');
  const outline = subjects.map((subject) => `- ${subject}`).join('\n');

  let text = outline;
  let truncated = false;

  for (const message of cleaned) {
    const body = message.split('\n').slice(1).join('\n').trim();
    if (!body) continue;

    const next = `${text}\n\n## ${message.split('\n')[0]}\n\n${body}`;
    if (next.length > maxChars) {
      truncated = true;
      break;
    }
    text = next;
  }

  if (!isSubstantive(text)) return { text: '', source: 'none', commitCount: 0, truncated: false };

  return {
    text: text.slice(0, maxChars),
    source: 'commits',
    commitCount: cleaned.length,
    truncated,
  };
}
