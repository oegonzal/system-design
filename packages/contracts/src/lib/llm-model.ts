import { z } from 'zod';

/**
 * Which model backs a model-backed role. A booted quality loop always names
 * one — a process without a provider never starts — so a live report (the
 * health check, a derivation, a run in flight) carries a model. `null` only on
 * a run recorded before the loop required a model; nothing invents a name
 * for those.
 */
export const llmModelSchema = z.strictObject({ model: z.string().nullable() });
export type LlmModelDto = z.infer<typeof llmModelSchema>;
