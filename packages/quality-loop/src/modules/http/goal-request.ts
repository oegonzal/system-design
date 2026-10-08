/**
 * A goal at the edge, held to the engine's own budget: bytes, as the engine
 * counts it (`textBytes`), so a goal the edge accepts is one no stage clips —
 * a character cap passes a multi-byte goal four times the budget. The body of
 * the tools that take a goal and nothing else — the retrieval report, the
 * route report — is that field alone.
 */
import { GOAL_BUDGET_BYTES, textBytes } from '@sysdesign/contracts';
import { z } from 'zod';

/** A goal: present, and within the bytes a stage reads. */
export const goalField = z
  .string()
  .min(1)
  .refine((goal) => textBytes(goal) <= GOAL_BUDGET_BYTES, {
    message: `the goal is longer than the ${GOAL_BUDGET_BYTES} bytes a stage reads`,
  });

export const goalRequestSchema = z.strictObject({ goal: goalField });
