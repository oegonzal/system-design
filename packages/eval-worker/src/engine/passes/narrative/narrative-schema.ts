/**
 * What the narrative pass asks the model to return. Bounded and clamped by
 * the schema itself — the pass never has to sanitize scores.
 */
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
});

export type NarrativeCritique = z.infer<typeof narrativeSchema>;
