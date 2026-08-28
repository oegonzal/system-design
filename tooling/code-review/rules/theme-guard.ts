import type { Finding } from '../policy';
import type { ChangedFile } from './index';

/**
 * The branding tripwire.
 *
 * This repository must read as built from scratch, so two vocabularies from
 * the scaffolds it must never reference are banned outright, everywhere, in
 * any casing. The pre-commit hook runs the same check at the git layer before
 * a token is spent; this rule is the copy that lives inside the review
 * pipeline, so a branch review, a CI run and a `--base` sweep all trip on it
 * too — the hook only sees commits made through it.
 *
 * The pattern is assembled from fragments so this file can state the rule
 * without itself containing the strings it bans — otherwise the tripwire would
 * be the one permanent match a repo-wide sweep could never get rid of. The
 * spec builds its fixtures the same way.
 */
const FRAGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['cho', 'rus'],
  ['poke', 'mon'],
];

export const BANNED = new RegExp(FRAGMENTS.map((pair) => pair.join('')).join('|'), 'i');

/**
 * Files the rule must not scan:
 *
 * - `CLAUDE.md` is the local, gitignored working-notes file, and its notes may
 *   legitimately name the reference material. It can never reach the index, so
 *   exempting it loses nothing.
 * - this rule's own file, which had to state the fragments to ban them.
 */
const OWN_FILE = 'tooling/code-review/rules/theme-guard.ts';

export const exempt = (file: string): boolean =>
  file === OWN_FILE || file.split('/').pop() === 'CLAUDE.md';

/**
 * `high` — one finding per offending file, pointing at the first hit.
 *
 * One rather than one-per-line, deliberately: a file that mentions the banned
 * vocabulary forty times needs the same single action as a file that mentions
 * it once, and forty findings would bury whatever else the review had to say.
 */
export const themeGuard = (files: readonly ChangedFile[]): Finding[] => {
  const findings: Finding[] = [];

  for (const { file, content } of files) {
    if (exempt(file) || content === undefined) continue;

    const lines = content.split('\n');
    const at = lines.findIndex((line) => BANNED.test(line));
    if (at === -1) continue;

    const total = lines.filter((line) => BANNED.test(line)).length;

    findings.push({
      severity: 'high',
      file,
      line: at + 1,
      category: 'branding',
      evidence: lines[at]?.trim() ?? '',
      problem: `The file matches the branding tripwire on ${total} line(s) — vocabulary this repository must never contain.`,
      recommendation: 'Rename or remove every reference; the project reads as built from scratch.',
    });
  }

  return findings;
};
