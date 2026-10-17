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

const base = { cycleId: z.string().min(1), sessionId: z.string().min(1) };

/** A cycle began over a studio session's canvas. */
export const designStartedSchema = z.strictObject({ ...base });

/** The coach improved the canvas and it was written back. */
export const designRevisedSchema = z.strictObject({ ...base, designRunId: z.string().min(1) });

/** The finished run was digested and stored as memory. */
export const designStoredSchema = z.strictObject({
  ...base,
  designRunId: z.string().min(1),
  orchestrationRunId: z.string().min(1),
});
