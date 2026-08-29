/**
 * Declarative difficulty-aware severity. The same structural miss is a
 * sharper lesson at a harder tier — a queue with no DLQ is a footnote at
 * intro and a real problem at advanced — so profiles may re-grade a rule's
 * severity per difficulty without touching the rule itself. The policy is a
 * plain value on the pass options, so tuning it is a profile edit, never a
 * code change, and historical evaluations keep the policy they ran under.
 */
import {
  PROMPT_DIFFICULTIES,
  SEVERITIES,
  type PromptDifficulty,
  type Severity,
} from '@sysdesign/contracts';

/** ruleId → (difficulty → severity that replaces the rule's own). */
export type SeverityOverrides = Record<string, Partial<Record<PromptDifficulty, Severity>>>;

/**
 * Pure: returns new findings with severity swapped wherever the overrides
 * name this finding's rule at this difficulty. Expectation findings (no
 * ruleId) and unmatched rules pass through untouched, same references.
 */
export function applySeverityPolicy<T extends { ruleId: string | null; severity: Severity }>(
  findings: readonly T[],
  difficulty: PromptDifficulty,
  overrides: SeverityOverrides,
): T[] {
  return findings.map((finding) => {
    if (!finding.ruleId) return finding;
    const severity = overrides[finding.ruleId]?.[difficulty];
    return severity === undefined || severity === finding.severity
      ? finding
      : { ...finding, severity };
  });
}

/**
 * Defensive parse of the untyped profile option — a malformed override must
 * degrade to "no override", never throw mid-evaluation or smuggle an unknown
 * severity into the score math. Unknown difficulties and severities are
 * dropped entry by entry; anything that is not a two-level object is ignored.
 */
export function readSeverityOverrides(value: unknown): SeverityOverrides {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const overrides: SeverityOverrides = {};
  for (const [ruleId, byDifficulty] of Object.entries(value)) {
    if (typeof byDifficulty !== 'object' || byDifficulty === null || Array.isArray(byDifficulty)) {
      continue;
    }
    const parsed: Partial<Record<PromptDifficulty, Severity>> = {};
    for (const [difficulty, severity] of Object.entries(byDifficulty as Record<string, unknown>)) {
      if (!(PROMPT_DIFFICULTIES as readonly string[]).includes(difficulty)) continue;
      if (typeof severity !== 'string' || !(SEVERITIES as readonly string[]).includes(severity)) {
        continue;
      }
      parsed[difficulty as PromptDifficulty] = severity as Severity;
    }
    if (Object.keys(parsed).length > 0) overrides[ruleId] = parsed;
  }
  return overrides;
}
