import { z } from 'zod';
import {
  AXIS_FACTOR_LEVELS,
  type AxisFactor,
  type AxisFactorLevel,
  type CanvasGraph,
  type EvalDimension,
  type WorkflowSpec,
} from '@sysdesign/contracts';

import { enumTuple, workflowItemIds } from '../graded-grounding';

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

/** The four shortfall lenses a grounded weakness can come from (futureGain is upside, not a shortfall). */
export const WEAKNESS_FACTORS = [
  'objectiveAlignment',
  'completeness',
  'feasibility',
  'risk',
] as const;
export type WeaknessFactor = (typeof WEAKNESS_FACTORS)[number];

/**
 * Which dimension each lens's shortfall lands on — engine-owned, generic
 * mapping (the evaluator judges through its business lens; the engine decides
 * which score the shortfall touches). Not derived from any prose.
 */
export const FACTOR_DIMENSION: Record<WeaknessFactor, EvalDimension> = {
  objectiveAlignment: 'product',
  completeness: 'product',
  feasibility: 'reliability',
  risk: 'reliability',
};

export interface WorkabilityWeakness {
  requirementId: string;
  factor: WeaknessFactor;
  /** Weakness magnitude — how badly this workflow item is unfulfilled through this lens. */
  weakness: AxisFactorLevel;
  confidence: AxisFactorLevel;
  affectedComponents: string[];
  rationale: string;
}

export interface WorkabilityCritique {
  factors: {
    objectiveAlignment: { level: AxisFactorLevel; rationale: string };
    completeness: { level: AxisFactorLevel; rationale: string };
    feasibility: { level: AxisFactorLevel; rationale: string };
    risk: { level: AxisFactorLevel; rationale: string };
    futureGain: { level: AxisFactorLevel; rationale: string };
  };
  /** Grounded, per-workflow-item shortfalls — the graded evidence the engine scores. */
  weaknesses: WorkabilityWeakness[];
  summary: string;
}

/**
 * The workability schema, built per request so a weakness's `requirementId` is a
 * `z.enum` over THIS prompt's workflow items and `affectedComponents` over THIS
 * canvas's nodes. The five global factors stay for the advisory meter; the
 * `weaknesses` array is the grounded evidence the engine's scorer reads.
 */
export function buildWorkabilitySchema(
  graph: CanvasGraph,
  spec: WorkflowSpec,
): z.ZodType<WorkabilityCritique> {
  const itemTuple = enumTuple(workflowItemIds(spec)) ?? (['__none__'] as [string, ...string[]]);
  const nodeTuple = enumTuple(graph.nodes.map((node) => node.id));
  const affectedComponents = nodeTuple
    ? z.array(z.enum(nodeTuple)).max(10)
    : z.array(z.string()).max(0);

  return z.object({
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
    weaknesses: z
      .array(
        z.object({
          requirementId: z
            .enum(itemTuple)
            .describe(
              'The workflow item (operation/event/ingest/aggregation/entity id) this shortfall is about.',
            ),
          factor: z.enum(WEAKNESS_FACTORS).describe('Which lens the shortfall comes from.'),
          weakness: z
            .enum(AXIS_FACTOR_LEVELS)
            .describe(
              'How badly this item falls short through that lens — the magnitude the engine scores.',
            ),
          confidence: z
            .enum(AXIS_FACTOR_LEVELS)
            .describe('How sure you are the shortfall is real.'),
          affectedComponents,
          rationale: z.string().max(400),
        }),
      )
      .max(10)
      .describe(
        'Grounded, per-item shortfalls only — one per real gap, never restating existence checks.',
      ),
    summary: z.string().max(800),
  }) as z.ZodType<WorkabilityCritique>;
}

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
    // Risk keeps its RAW judged level (the rationale describes remaining
    // exposure), so the display must know its direction is inverted.
    ...(id === 'risk' ? { polarity: 'higher-is-worse' as const } : {}),
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
