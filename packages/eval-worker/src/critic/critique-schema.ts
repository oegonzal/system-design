import { EVAL_DIMENSIONS, SEVERITIES } from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * The critique the model must produce, enforced server-side via structured
 * outputs. Enums come from the contract tuples, so the model cannot invent a
 * dimension the UI has no bucket for — and the clamp in `anthropic-critic`
 * only exists for defense in depth.
 */
export const critiqueSchema = z.object({
  summary: z
    .string()
    .max(1200)
    .describe('2-4 sentences: the strongest quality of the design and its most important gap.'),
  findings: z
    .array(
      z.object({
        dimension: z.enum(EVAL_DIMENSIONS),
        severity: z.enum(SEVERITIES),
        title: z.string().max(120),
        message: z
          .string()
          .max(1000)
          .describe('The lesson: why this matters at the stated scale, and what to change.'),
        affectedNodeIds: z
          .array(z.string().max(64))
          .max(20)
          .describe('Ids of existing canvas nodes this concerns. Empty if graph-wide.'),
      }),
    )
    .max(4)
    .describe('New insights only — never restate a deterministic finding.'),
});

export type Critique = z.infer<typeof critiqueSchema>;
