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

/**
 * The original model: every dimension starts at 100 and findings subtract.
 * Kept as a policy variant so history stays reproducible; the coverage model
 * replaces it as the shipped default.
 */
export interface SubtractiveScoringPolicy {
  model: 'subtractive';
  severityPenalties: Record<Severity, number>;
  dimensionWeights: Record<EvalDimension, number>;
  gradeBands: GradeBands;
}

export type ScoringPolicy = SubtractiveScoringPolicy;

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
