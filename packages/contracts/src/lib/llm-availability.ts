import { z } from 'zod';

/**
 * Whether the EMBEDDINGS tier can run — derived facts only, never the key.
 * The memory half of a run is optional: without OPENAI_API_KEY its steps skip
 * with `embeddings-disabled` and the target still runs. The model itself is
 * never optional — a loop without one does not boot — so its report is the
 * plain `LlmModelDto`. A schema, because an orchestrator records it at open
 * and declares the shape of what it records.
 */
export const llmAvailabilitySchema = z.strictObject({
  enabled: z.boolean(),
  model: z.string().nullable(),
  reason: z.enum(['no-key']).nullable(),
});
export type LlmAvailabilityDto = z.infer<typeof llmAvailabilitySchema>;
