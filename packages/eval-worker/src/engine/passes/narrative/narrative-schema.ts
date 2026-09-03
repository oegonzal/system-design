/**
 * What the narrative pass asks the model to return. Bounded and clamped by
 * the schema itself — the pass never has to sanitize scores. Alongside the
 * axis, the model reports misalignment findings — places the story and the
 * drawing disagree — as graded weaknesses: each carries the shared ordinals
 * (magnitude, confidence, requirement + component grounding) the engine
 * prices. The narrative lens IS the explanation lens, so the pass fixes the
 * dimension; the model does not choose one.
 */
import { SEVERITIES, type CanvasGraph, type Severity } from '@sysdesign/contracts';
import { z } from 'zod';

import type { PromptFacts } from '../../types';
import { gradedWeaknessShape, type GradedWeaknessRaw } from '../graded-grounding';

export const NARRATIVE_AXIS_ID = 'narrative';
export const NARRATIVE_AXIS_LABEL = 'Narrative & alignment';

export interface NarrativeFindingRaw extends GradedWeaknessRaw {
  severity: Severity;
  title: string;
  message: string;
}

export interface NarrativeCritique {
  score: number;
  subScores: {
    componentClarity: number;
    flowStory: number;
    requirementCoverage: number;
    diagramConsistency: number;
  };
  summary: string;
  findings: NarrativeFindingRaw[];
}

const subScore = (description: string) => z.number().int().min(0).max(100).describe(description);

/** Per request, so each misalignment is grounded to THIS prompt's requirements and THIS canvas's nodes. */
export function buildNarrativeSchema(
  graph: CanvasGraph,
  facts: PromptFacts,
): z.ZodType<NarrativeCritique> {
  return z.object({
    /** Overall explanation quality of the prose for this diagram and prompt, 0–100. */
    score: z.number().int().min(0).max(100),
    subScores: z.object({
      componentClarity: subScore(
        'Does every real component get a clear, specific purpose (not just its label restated)? Lower it for unexplained boxes or generic prose.',
      ),
      flowStory: subScore(
        'Does the prose trace how control and data actually move between the drawn components, end to end?',
      ),
      requirementCoverage: subScore(
        'Is each functional requirement narrated and tied to the mechanism that serves it, rather than waved at?',
      ),
      diagramConsistency: subScore(
        'Does the prose match what is drawn? Lower it for mechanisms with no node/edge behind them or flows described differently than drawn.',
      ),
    }),
    summary: z.string().max(800),
    findings: z
      .array(
        z.object({
          severity: z.enum(SEVERITIES),
          ...gradedWeaknessShape(graph, facts),
          title: z.string().max(120),
          message: z
            .string()
            .max(1000)
            .describe(
              'Quote the offending narrative claim, then say what the diagram actually shows and how to reconcile them.',
            ),
        }),
      )
      .max(6)
      .describe(
        'Misalignments only: claims the diagram does not implement, flows described differently than drawn, requirements the prose waves at without a mechanism. Never restate a deterministic finding.',
      ),
  }) as z.ZodType<NarrativeCritique>;
}
