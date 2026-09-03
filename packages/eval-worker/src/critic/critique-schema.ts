import {
  AXIS_FACTOR_LEVELS,
  EVAL_DIMENSIONS,
  SEVERITIES,
  type AxisFactorLevel,
  type CanvasGraph,
  type EvalDimension,
  type Severity,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { enumTuple, requirementIds } from '../engine/passes/graded-grounding';
import type { PromptFacts } from '../engine/types';

/**
 * One weakness the critic found, as the model reports it: a system-design
 * dimension, the weakness MAGNITUDE and the critic's CONFIDENCE as ordinals (the
 * currency the engine scores), grounded to a prompt requirement and the affected
 * components, with the lesson as prose. The ids are enum-locked per request (see
 * `buildCriticSchema`) so the model cannot ground to a requirement or node that
 * does not exist.
 */
export interface CriticFindingRaw {
  dimension: EvalDimension;
  severity: Severity;
  weakness: AxisFactorLevel;
  confidence: AxisFactorLevel;
  requirementId: string | null;
  affectedComponents: string[];
  title: string;
  rationale: string;
}

export interface Critique {
  summary: string;
  findings: CriticFindingRaw[];
}

/**
 * The critique schema, built per request so `requirementId` and
 * `affectedComponents` are `z.enum`s over THIS prompt's requirements and THIS
 * canvas's nodes — grounding the model cannot escape, the same idiom the binding
 * suggester uses. When the prompt states no groundable requirement or the canvas
 * has no nodes, the corresponding field degrades to null / an empty list rather
 * than inventing an enum. The clamp in `anthropic-critic` is defense in depth.
 */
export function buildCriticSchema(graph: CanvasGraph, facts: PromptFacts): z.ZodType<Critique> {
  const reqTuple = enumTuple(requirementIds(facts));
  const nodeTuple = enumTuple(graph.nodes.map((node) => node.id));

  const requirementId = (reqTuple ? z.enum(reqTuple).nullable() : z.null()).describe(
    'The prompt requirement (an NFR or workflow item id) this weakens; null only when the weakness is genuinely cross-cutting.',
  );
  const affectedComponents = (
    nodeTuple ? z.array(z.enum(nodeTuple)).max(20) : z.array(z.string()).max(0)
  ).describe('Ids of existing canvas nodes this concerns. Empty if graph-wide.');

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
          weakness: z
            .enum(AXIS_FACTOR_LEVELS)
            .describe(
              'How badly this hurts the design at the stated scale — the magnitude the engine scores. none = not really a weakness.',
            ),
          confidence: z
            .enum(AXIS_FACTOR_LEVELS)
            .describe('How sure you are this is a real weakness, not a matter of taste.'),
          requirementId,
          affectedComponents,
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
