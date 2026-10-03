/**
 * A goal at the edge, held to the engine's own budget: bytes, as the engine
 * counts it (`goalBytes`), so a goal the edge accepts is one no stage clips —
 * a character cap passes a multi-byte goal four times the budget. The body of
 * the tools that take a goal and nothing else — the retrieval report, the
 * route report — is that field alone.
 */
import { z } from 'zod';

import { GOAL_MAX_BYTES, goalBytes } from '../../core/contracts';

/** A goal: present, and within the bytes a stage reads. */
export const goalField = z
  .string()
  .min(1)
  .refine((goal) => goalBytes(goal) <= GOAL_MAX_BYTES, {
    message: `the goal is longer than the ${GOAL_MAX_BYTES} bytes a stage reads`,
  });

export const goalRequestSchema = z.strictObject({ goal: goalField });
