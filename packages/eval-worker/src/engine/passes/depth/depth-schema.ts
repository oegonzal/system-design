/**
 * What the depth pass asks the model to return. Bounded and clamped by the
 * schema itself — the pass never has to sanitize scores. Beside the advisory
 * numeric axis, the model reports the depth WEAKNESSES it found as graded
 * evidence: depth spans the technical dimensions, so — like the critic — the
 * model names the dimension each weakness lands on, grounded to a requirement
 * and components by the shared ordinals the engine prices.
 */
import {
  EVAL_DIMENSIONS,
  SEVERITIES,
  type CanvasGraph,
  type EvalDimension,
  type Severity,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { PromptFacts } from '../../types';
import { gradedWeaknessShape, type GradedWeaknessRaw } from '../graded-grounding';

export const DEPTH_AXIS_ID = 'depth';
export const DEPTH_AXIS_LABEL = 'Depth & justification';

export interface DepthWeaknessRaw extends GradedWeaknessRaw {
  dimension: EvalDimension;
  severity: Severity;
  rationale: string;
}

export interface DepthCritique {
  depthScore: number;
  subScores: {
    tradeoffArticulation: number;
    bottleneckAwareness: number;
    failureDesign: number;
    dataFlowClarity: number;
    contractQuality: number;
  };
  weaknesses: DepthWeaknessRaw[];
  summary: string;
}

const subScore = () => z.number().int().min(0).max(100);

/** Per request, so each weakness is grounded to THIS prompt's requirements and THIS canvas's nodes. */
export function buildDepthSchema(graph: CanvasGraph, facts: PromptFacts): z.ZodType<DepthCritique> {
  return z.object({
    /** How deeply the hard problems are addressed by mechanism, 0–100. */
    depthScore: subScore(),
    subScores: z.object({
      tradeoffArticulation: subScore(),
      bottleneckAwareness: subScore(),
      failureDesign: subScore(),
      dataFlowClarity: subScore(),
      contractQuality: subScore(),
    }),
    weaknesses: z
      .array(
        z.object({
          dimension: z.enum(EVAL_DIMENSIONS),
          severity: z.enum(SEVERITIES),
          ...gradedWeaknessShape(graph, facts),
          rationale: z
            .string()
            .max(600)
            .describe('The hard problem left shallow, and the mechanism that would deepen it.'),
        }),
      )
      .max(8)
      .describe(
        'The specific places the design addresses a hard problem by dropping a box rather than by mechanism. Never restate a deterministic finding.',
      ),
    summary: z.string().max(1200),
  }) as z.ZodType<DepthCritique>;
}
