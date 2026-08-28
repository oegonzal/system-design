import type { Decision, SourcedFinding } from './evaluator';

export interface ReviewOutcome {
  decision: Decision;
  summary: string;
  findings: SourcedFinding[];
  /** User-facing notes: dropped findings, warnings, skipped critics. */
  dropped: string[];
  costUsd: number;
  /** Files whose diff actually reached the critics. */
  filesReviewed: number;
  filesChanged: number;
  filesOmitted: string[];
  truncated: boolean;
}

/** Enough of the omitted list to be actionable; the record holds all of it. */
const OMITTED_SHOWN = 8;

const coverage = (outcome: ReviewOutcome): string =>
  `${outcome.filesReviewed} of ${outcome.filesChanged} file(s) reviewed · $${outcome.costUsd.toFixed(4)}` +
  (outcome.filesOmitted.length > 0 ? ` · ${outcome.filesOmitted.length} not shown` : '');

const ICON: Record<Decision, string> = { pass: '✓', warn: '!', fail: '✗' };
const SEVERITY_ORDER: Record<SourcedFinding['severity'], number> = { high: 0, medium: 1, low: 2 };

const bySeverity = (a: SourcedFinding, b: SourcedFinding) =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

/** Human-readable output for a terminal — the pre-commit hook's voice. */
export function toTerminal(outcome: ReviewOutcome): string {
  const lines: string[] = [];
  const { decision, findings } = outcome;

  lines.push('');
  lines.push(`  ${ICON[decision]} code review: ${decision.toUpperCase()}  ${outcome.summary}`);
  lines.push(`    ${coverage(outcome)}`);

  // Named, not just counted: "12 not shown" is a number, and a reviewer needs
  // to know whether the file they care about was one of them.
  for (const file of outcome.filesOmitted.slice(0, OMITTED_SHOWN)) {
    lines.push(`    (not reviewed) ${file}`);
  }
  if (outcome.filesOmitted.length > OMITTED_SHOWN) {
    lines.push(`    …and ${outcome.filesOmitted.length - OMITTED_SHOWN} further file(s)`);
  }

  for (const finding of [...findings].sort(bySeverity)) {
    const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push('');
    lines.push(`    [${finding.severity}] ${where}  (${finding.source}/${finding.category})`);
    lines.push(`      ${finding.problem}`);
    lines.push(`      evidence: ${truncate(finding.evidence, 160)}`);
    lines.push(`      fix     : ${finding.recommendation}`);
  }

  for (const drop of outcome.dropped) {
    lines.push(`    (note) ${drop}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Markdown for a GitHub step summary or a sticky pull request comment.
 *
 * No `<!-- code-review -->` marker here: the CI workflow prepends its own when
 * it upserts the sticky comment, and a second copy would defeat the "find my
 * previous comment" search.
 */
export function toMarkdown(outcome: ReviewOutcome): string {
  const { decision, findings } = outcome;
  const lines: string[] = [];

  lines.push(`## ${ICON[decision]} Code review — **${decision.toUpperCase()}**`);
  lines.push('');
  lines.push(outcome.summary);
  lines.push('');
  lines.push(`_${coverage(outcome)}_`);

  // Collapsed: the sticky comment is updated in place on every push, and an
  // inline list of dozens of paths would bury the findings.
  if (outcome.filesOmitted.length > 0) {
    lines.push('');
    lines.push(`<details><summary>${outcome.filesOmitted.length} file(s) not reviewed</summary>`);
    lines.push('');
    lines.push(...outcome.filesOmitted.map((file) => `- \`${file}\``));
    lines.push('');
    lines.push('</details>');
  }

  if (findings.length === 0) {
    lines.push('');
    lines.push('No findings.');
    if (outcome.dropped.length > 0) {
      lines.push('');
      lines.push(...outcome.dropped.map((note) => `> ${note}`));
    }
    return lines.join('\n');
  }

  lines.push('');
  lines.push('| Severity | Location | Source | Problem |');
  lines.push('|:--|:--|:--|:--|');
  for (const finding of [...findings].sort(bySeverity)) {
    const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push(
      `| \`${finding.severity}\` | \`${where}\` | ${finding.source}/${finding.category} | ${escapePipes(
        finding.problem,
      )} |`,
    );
  }

  lines.push('');
  for (const finding of [...findings].sort(bySeverity)) {
    const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push(
      `<details><summary><code>${where}</code> — ${escapePipes(finding.problem)}</summary>`,
    );
    lines.push('');
    lines.push(`**Evidence**`);
    lines.push('');
    lines.push('```');
    lines.push(truncate(finding.evidence, 600));
    lines.push('```');
    lines.push('');
    lines.push(`**Recommendation** — ${finding.recommendation}`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (outcome.dropped.length > 0) {
    lines.push('');
    lines.push(...outcome.dropped.map((note) => `> ${note}`));
  }

  return lines.join('\n');
}

const escapePipes = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;
