import { memoryPolicySchema, type MemoryPolicy } from '@sysdesign/agentic-memory';
import { z } from 'zod';

/**
 * How the service runs its memory spaces, as declared data: the policy every
 * new space snapshots — its scope keys, the terms' time to live, how a recall
 * is weighted and budgeted, the support consolidation needs — and how often
 * this process sweeps. The sweep's schedule belongs to the process, not to a
 * space, so it is never part of a snapshot.
 */
export const memorySettingsSchema = memoryPolicySchema.extend({
  /** Time between sweeps; null never sweeps, which is how a spec keeps the timer to itself. */
  sweep: z.strictObject({ everyMs: z.number().int().min(1).nullable() }),
});
export type MemorySettings = z.infer<typeof memorySettingsSchema>;

/** The policy a new space snapshots: the settings without this process's sweep schedule. */
export const policyOf = ({ sweep, ...policy }: MemorySettings): MemoryPolicy => policy;
