import { z } from 'zod';

/**
 * What the agentic-system service says happened to a memory-design cycle, for
 * whoever keeps a record of them — an observability subscriber, a digest. The
 * bus retains them whether or not anyone is listening yet, as a session's own
 * events are. The service names itself the source; anyone may publish.
 */
export const DESIGN_TOPICS = {
  started: 'agentic-system.design.started',
  revised: 'agentic-system.design.revised',
  stored: 'agentic-system.design.stored',
} as const;

/** How the agentic-system service names itself on the bus. */
export const AGENTIC_SYSTEM_SOURCE = 'agentic-system';

/** Every event names its cycle and the brief it designs for, by the brief's digest. */
const base = { cycleId: z.string().min(1), goalDigest: z.string().min(1) };

/** A cycle began for a memory brief. */
export const designStartedSchema = z.strictObject({ ...base });

/** The coach run finished; its best iteration holds the memory strategy. */
export const designRevisedSchema = z.strictObject({ ...base, designRunId: z.string().min(1) });

/** The finished run was digested and stored as memory. */
export const designStoredSchema = z.strictObject({
  ...base,
  designRunId: z.string().min(1),
  orchestrationRunId: z.string().min(1),
});
