import { z } from 'zod';

/**
 * How a design cycle is run, as declared data: which pipeline coaches the
 * memory strategy, which orchestrator learns from the finished run, how many
 * coach iterations, whether the producer recalls prior memory-design lessons,
 * and how often the driver polls the run. A program writes none of this at
 * runtime, so the schema is exact.
 */
export const designSettingsSchema = z.strictObject({
  pipeline: z.string().min(1),
  orchestrator: z.string().min(1),
  maxIterations: z.number().int().min(1).max(10),
  recall: z.boolean(),
  pollEveryMs: z.number().int().min(1),
});
export type DesignSettings = z.infer<typeof designSettingsSchema>;
