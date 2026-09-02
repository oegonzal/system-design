/**
 * The declarative shape of an evaluation: which passes run, in what order,
 * and how their evidence turns into scores. Profiles are versioned values —
 * every evaluation records the profile it was graded under, so tuning the
 * rubric never rewrites history.
 */
import {
  EVAL_DIMENSIONS,
  type EvalDimension,
  type Grade,
  type Severity,
} from '@sysdesign/contracts';

export interface EvalPassConfig {
  pass: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

/** Score thresholds per letter; anything under D is an F. */
export interface GradeBands {
  A: number;
  B: number;
  C: number;
  D: number;
}

/** "grade ≤ maxGrade once `atLeast` deterministic findings of `severity` exist." */
export interface GradeCapRule {
  severity: Severity;
  atLeast: number;
  maxGrade: Grade;
}

/** "grade ≤ maxGrade whenever this expectation is unmet" — e.g. no A without a walkthrough. */
export interface ExpectationGradeCapRule {
  whenExpectationUnmet: string;
  maxGrade: Grade;
}

/** One lesson, one finding: drop the rule's finding when its paired expectation is unmet. */
export interface SuppressionRule {
  ruleId: string;
  whenExpectationUnmet: string;
}

/**
 * The coverage model: each dimension's base is earned by meeting the prompt's
 * expectations, violations subtract with geometric decay (stacking hurts but
 * never nukes a dimension the way a hard floor did), and critical findings
 * cap the letter grade regardless of the numbers. Absence is no longer free.
 */
export interface CoverageScoringPolicy {
  model: 'coverage';
  violationPenalties: Record<Severity, number>;
  /** Multiplier on each successive violation within a dimension, in (0, 1]. */
  violationDecay: number;
  dimensionWeights: Record<EvalDimension, number>;
  gradeBands: GradeBands;
  gradeCaps: GradeCapRule[];
  /** Caps keyed to an unmet expectation rather than a finding count. */
  expectationGradeCaps: ExpectationGradeCapRule[];
  suppressions: SuppressionRule[];
}

export type ScoringPolicy = CoverageScoringPolicy;

export interface EvalProfile {
  id: string;
  version: string;
  passes: EvalPassConfig[];
  scoring: ScoringPolicy;
}

/** Fails fast on a malformed profile — a bad rubric must never grade anyone. */
export function validateProfile(profile: EvalProfile): void {
  const seen = new Set<string>();
  for (const config of profile.passes) {
    if (seen.has(config.pass)) {
      throw new Error(`eval profile ${describe(profile)} lists pass twice: ${config.pass}`);
    }
    seen.add(config.pass);
  }

  let weightSum = 0;
  for (const dimension of EVAL_DIMENSIONS) {
    weightSum += profile.scoring.dimensionWeights[dimension];
  }
  if (Math.abs(weightSum - 1) > 1e-9) {
    throw new Error(
      `eval profile ${describe(profile)} dimension weights sum to ${weightSum}, not 1`,
    );
  }

  const { A, B, C, D } = profile.scoring.gradeBands;
  if (!(A > B && B > C && C > D && D > 0)) {
    throw new Error(`eval profile ${describe(profile)} grade bands must strictly descend`);
  }

  const decay = profile.scoring.violationDecay;
  if (!(decay > 0 && decay <= 1)) {
    throw new Error(`eval profile ${describe(profile)} violation decay must be in (0, 1]`);
  }
}

export function describe(profile: EvalProfile): string {
  return `${profile.id}@${profile.version}`;
}

export function gradeForScore(overall: number, bands: GradeBands): Grade {
  if (overall >= bands.A) return 'A';
  if (overall >= bands.B) return 'B';
  if (overall >= bands.C) return 'C';
  if (overall >= bands.D) return 'D';
  return 'F';
}
