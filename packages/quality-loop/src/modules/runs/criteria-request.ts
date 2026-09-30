import { z } from 'zod';

import { GOAL_MAX_BYTES } from '../../core/contracts';

/** The body of `POST /criteria`: derive a pipeline's rubric from a goal, and nothing else. */
export const criteriaRequestSchema = z.strictObject({
  pipeline: z.string().min(1),
  goal: z.string().min(1).max(GOAL_MAX_BYTES),
});
