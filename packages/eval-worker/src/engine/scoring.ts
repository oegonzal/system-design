/**
 * Deterministic scoring: findings subtract fixed severity weights from their
 * dimension, dimensions blend into one overall score, the overall maps to a
 * letter band. No randomness, no clock — the same graph and facts always
 * produce the same numbers, which is what makes evaluations diffable across
 * revisions.
 */
import {
  EVAL_DIMENSIONS,
  type DimensionScores,
  type EvalDimension,
  type Grade,
  type Severity,
} from '@sysdesign/contracts';

import type { RuleFinding } from './types';

export const ENGINE_VERSION = '1.0.0';

/** How many points one finding of each severity costs its dimension. */
export const SEVERITY_WEIGHTS = {
  critical: 40,
  high: 25,
  medium: 12,
  low: 5,
  info: 0,
} as const satisfies Record<Severity, number>;

/** How much each dimension contributes to the overall score; sums to 1. */
export const DIMENSION_WEIGHTS = {
  reliability: 0.2,
  scalability: 0.25,
  performance: 0.15,
  data: 0.15,
  messaging: 0.1,
  security: 0.1,
  hygiene: 0.05,
} as const satisfies Record<EvalDimension, number>;

/** Each dimension starts at 100 and loses the weight of every finding filed under it, floored at 0. */
export function scoreDimensions(findings: readonly RuleFinding[]): DimensionScores {
  const scores = {} as DimensionScores;
  for (const dimension of EVAL_DIMENSIONS) scores[dimension] = 100;
  for (const finding of findings) {
    scores[finding.dimension] = Math.max(
      0,
      scores[finding.dimension] - SEVERITY_WEIGHTS[finding.severity],
    );
  }
  return scores;
}

/** Weighted blend of the dimension scores, rounded to one decimal. */
export function overallScore(scores: DimensionScores): number {
  let total = 0;
  for (const dimension of EVAL_DIMENSIONS) {
    total += scores[dimension] * DIMENSION_WEIGHTS[dimension];
  }
  return Math.round(total * 10) / 10;
}

export function gradeFor(overall: number): Grade {
  if (overall >= 90) return 'A';
  if (overall >= 75) return 'B';
  if (overall >= 60) return 'C';
  if (overall >= 45) return 'D';
  return 'F';
}
