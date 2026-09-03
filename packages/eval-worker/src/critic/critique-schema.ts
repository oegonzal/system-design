import {
  EVAL_DIMENSIONS,
  SEVERITIES,
  type CanvasGraph,
  type EvalDimension,
  type Severity,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { gradedWeaknessShape, type GradedWeaknessRaw } from '../engine/passes/graded-grounding';
import type { PromptFacts } from '../engine/types';

/**
 * One weakness the critic found, as the model reports it: a system-design
 * dimension and display severity of the critic's own choosing, plus the shared
 * graded ordinals (magnitude, confidence, requirement and component grounding —
 * see `gradedWeaknessShape`), with the lesson as prose.
 */
export interface CriticFindingRaw extends GradedWeaknessRaw {
  dimension: EvalDimension;
  severity: Severity;
  title: string;
  rationale: string;
}

export interface Critique {
  summary: string;
  findings: CriticFindingRaw[];
}

/**
 * The critique schema, built per request so grounding is enum-locked to THIS
 * prompt's requirements and THIS canvas's nodes (the binding-suggester idiom).
 * The re-check in `anthropic-critic` is defense in depth.
 */
export function buildCriticSchema(graph: CanvasGraph, facts: PromptFacts): z.ZodType<Critique> {
  return z.object({
    summary: z
      .string()
      .max(1200)
      .describe('2-4 sentences: the strongest quality of the design and its most important gap.'),
    findings: z
      .array(
        z.object({
          dimension: z.enum(EVAL_DIMENSIONS),
          severity: z.enum(SEVERITIES),
          ...gradedWeaknessShape(graph, facts),
          title: z.string().max(120),
          rationale: z
            .string()
            .max(1000)
            .describe(
              'The lesson: why this weakens the named requirement at the stated scale, and what to change.',
            ),
        }),
      )
      .max(10)
      .describe('New insights only — never restate a deterministic finding.'),
  }) as z.ZodType<Critique>;
}
