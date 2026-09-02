import { z } from 'zod';
import { AXIS_FACTOR_LEVELS, type AxisFactor, type AxisFactorLevel } from '@sysdesign/contracts';

export const WORKABILITY_AXIS_ID = 'workability';
export const WORKABILITY_AXIS_LABEL = 'Business workability';

/**
 * The evaluator answers in ordinals, not numbers: what does the evidence
 * imply about each factor, and why. Numbers invite false precision from a
 * model; a level plus a rationale is the judgement a reviewer actually
 * forms. The numeric subScores channel is derived AFTER the fact so meters
 * can render — deterministically, from the ordinals.
 */
const factor = z.object({
  level: z.enum(AXIS_FACTOR_LEVELS),
  rationale: z.string().max(400),
});

export const workabilitySchema = z.object({
  factors: z.object({
    /** Does the design serve the stated business objective? */
    objectiveAlignment: factor,
    /** Contracts, lifecycles and events beyond the deterministic checklist. */
    completeness: factor,
    /** Would the declared workflow actually run as drawn? */
    feasibility: factor,
    /** How much business risk REMAINS unmitigated (inverted for display). */
    risk: factor,
    /** Headroom the workflow modelling buys the product later. */
    futureGain: factor,
  }),
  summary: z.string().max(800),
});

export type WorkabilityCritique = z.infer<typeof workabilitySchema>;

const FACTOR_LABELS: Record<keyof WorkabilityCritique['factors'], string> = {
  objectiveAlignment: 'Objective alignment',
  completeness: 'Completeness',
  feasibility: 'Feasibility',
  risk: 'Remaining risk',
  futureGain: 'Future gain',
};

const LEVEL_SCORE: Record<AxisFactorLevel, number> = { none: 0, low: 33, medium: 67, high: 100 };

/**
 * Ordinals → the display channels. `risk` inverts into `riskContainment` so
 * every meter reads "higher is better" like the depth axis's do; the axis
 * score is the rounded mean of the mapped values — a deterministic
 * post-processing of the model's ordinals, never a number the model chose.
 */
export function factorsToDisplay(critique: WorkabilityCritique): {
  factors: AxisFactor[];
  subScores: Record<string, number>;
  score: number;
} {
  const entries = Object.entries(critique.factors) as Array<
    [keyof WorkabilityCritique['factors'], { level: AxisFactorLevel; rationale: string }]
  >;
  const factors: AxisFactor[] = entries.map(([id, value]) => ({
    id,
    label: FACTOR_LABELS[id],
    level: value.level,
    rationale: value.rationale.trim(),
  }));
  const subScores: Record<string, number> = {};
  for (const [id, value] of entries) {
    const mapped = LEVEL_SCORE[value.level];
    if (id === 'risk') subScores['riskContainment'] = 100 - mapped;
    else subScores[id] = mapped;
  }
  const values = Object.values(subScores);
  const score = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return { factors, subScores, score };
}
