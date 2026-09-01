/**
 * What the narrative pass asks the model to return. Bounded and clamped by
 * the schema itself — the pass never has to sanitize scores. Alongside the
 * axis, the model may report misalignment findings: places the story and
 * the drawing disagree, persisted as advisory llm-source findings.
 */
import { EVAL_DIMENSIONS, SEVERITIES } from '@sysdesign/contracts';
import { z } from 'zod';

export const NARRATIVE_AXIS_ID = 'narrative';
export const NARRATIVE_AXIS_LABEL = 'Narrative & alignment';

export const narrativeSchema = z.object({
  /** How well the prose explains this diagram against this prompt, 0–100. */
  score: z.number().int().min(0).max(100),
  subScores: z.object({
    componentClarity: z.number().int().min(0).max(100),
    flowStory: z.number().int().min(0).max(100),
    requirementCoverage: z.number().int().min(0).max(100),
    diagramConsistency: z.number().int().min(0).max(100),
  }),
  summary: z.string().max(800),
  findings: z
    .array(
      z.object({
        dimension: z.enum(EVAL_DIMENSIONS),
        severity: z.enum(SEVERITIES),
        title: z.string().max(120),
        message: z
          .string()
          .max(1000)
          .describe(
            'Quote the offending narrative claim, then say what the diagram actually shows and how to reconcile them.',
          ),
        affectedNodeIds: z
          .array(z.string().max(64))
          .max(20)
          .describe('Ids of existing canvas nodes this concerns. Empty if graph-wide.'),
      }),
    )
    .max(6)
    .describe(
      'Misalignments only: claims the diagram does not implement, flows described differently than drawn, requirements the prose waves at without a mechanism. Never restate a deterministic finding.',
    ),
});

export type NarrativeCritique = z.infer<typeof narrativeSchema>;
