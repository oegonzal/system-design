/**
 * Stable orderings, so the same evidence always produces the same ledger and
 * the same charge order. Scales run from "against the claim" to "for it", which
 * is what lets one lower-middle median resolve every tie conservatively.
 */
import { AXIS_FACTOR_LEVELS, FIXABILITIES, SEVERITIES } from '@sysdesign/contracts';
import type {
  AxisFactorLevel,
  ConfirmedFinding,
  CriterionResult,
  Severity,
} from '@sysdesign/contracts';

/** info → critical. */
export const SEVERITY_MILD_FIRST: readonly Severity[] = [...SEVERITIES].reverse();
/** fail → pass; `not_applicable` is handled before a median is taken. */
export const RESULT_WORST_FIRST: readonly CriterionResult[] = ['fail', 'partial', 'pass'];
export const CONFIDENCE_LOW_FIRST: readonly AxisFactorLevel[] = AXIS_FACTOR_LEVELS;
export const FIXABILITY_LOCAL_FIRST = FIXABILITIES;

/** Lower-middle median on a scale: with an even count the tie goes to the lower index. */
export function medianLevel<L extends string>(values: readonly L[], scale: readonly L[]): L {
  const ranks = values.map((value) => scale.indexOf(value)).sort((a, b) => a - b);
  return scale[ranks[Math.floor((ranks.length - 1) / 2)]];
}

export const severityRank = (severity: Severity): number => SEVERITIES.indexOf(severity);
const confidenceRank = (level: AxisFactorLevel): number => AXIS_FACTOR_LEVELS.indexOf(level);

export const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Worst first: severity, then confidence high-first, then key. */
export function compareFindings(a: ConfirmedFinding, b: ConfirmedFinding): number {
  return (
    severityRank(a.severity) - severityRank(b.severity) ||
    confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
    compareStrings(a.key, b.key)
  );
}

export const unique = (values: readonly string[]): string[] => [...new Set(values)];
