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
  /** Overall explanation quality of the prose for this diagram and prompt, 0–100. */
  score: z.number().int().min(0).max(100),
  subScores: z.object({
    componentClarity: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(
        'Does every real component get a clear, specific purpose (not just its label restated)? Lower it for unexplained boxes or generic prose.',
      ),
    flowStory: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(
        'Does the prose trace how control and data actually move between the drawn components, end to end?',
      ),
    requirementCoverage: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(
        'Is each functional requirement narrated and tied to the mechanism that serves it, rather than waved at?',
      ),
    diagramConsistency: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(
        'Does the prose match what is drawn? Lower it for mechanisms with no node/edge behind them or flows described differently than drawn.',
      ),
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
