import type { Finding, Severity } from './policy';

/**
 * The deterministic end of the pipeline.
 *
 * Two streams of findings meet here: the always-on rules engine (runs with or
 * without an API key) and the sanitised critic reports. The LLM evaluator pass,
 * when it runs, only deduplicates and reconciles *critic* findings against each
 * other — it never sees the rule findings and cannot drop them, because a
 * deterministic check being argued away by a model would make the rules engine
 * advisory. Whatever survives both streams is merged and gated here, in code:
 *
 *     HIGH   -> fail   (exit 1)
 *     MEDIUM -> warn   (exit 0, visibly)
 *     LOW    -> informational
 *
 * No model decides severity's consequences; a critic or rule chooses `high`
 * knowing exactly what that means.
 */
export type Decision = 'pass' | 'warn' | 'fail';

/**
 * A finding plus where it came from: a critic name, or `rules/<rule>`.
 *
 * One field for both origins, so the report and the run record render every
 * finding the same way and a reader filters by prefix rather than by shape.
 */
export interface SourcedFinding extends Finding {
  source: string;
}

/** Prefixes a rule's findings so their origin survives the merge. */
export const ruleSource = (rule: string): string => `rules/${rule}`;

/**
 * Rule findings first, critics second, severity descending within each stream.
 *
 * Rules lead because they are the findings the reader can act on without
 * judgement — a violated boundary is a violated boundary — and because their
 * position must not depend on whether the critics ran at all.
 */
export function mergeFindings(
  ruleFindings: readonly SourcedFinding[],
  criticFindings: readonly SourcedFinding[],
): SourcedFinding[] {
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  const bySeverity = (a: SourcedFinding, b: SourcedFinding) => rank[a.severity] - rank[b.severity];

  return [...[...ruleFindings].sort(bySeverity), ...[...criticFindings].sort(bySeverity)];
}

/** The merge rule, in code. Deterministic, so an exit code is arguable from a record. */
export function decide(findings: readonly Finding[]): Decision {
  if (findings.some((f) => f.severity === 'high')) return 'fail';
  if (findings.some((f) => f.severity === 'medium')) return 'warn';
  return 'pass';
}

const DECISION_RANK: Record<Decision, number> = { pass: 0, warn: 1, fail: 2 };

/** Never downgrade: an incomplete review may only make the verdict stricter. */
export const worseOf = (a: Decision, b: Decision): Decision =>
  DECISION_RANK[a] >= DECISION_RANK[b] ? a : b;

export function defaultSummary(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No findings.';
  const counts = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return [
    counts.high ? `${counts.high} blocking` : '',
    counts.medium ? `${counts.medium} warning` : '',
    counts.low ? `${counts.low} informational` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
