import { z } from 'zod';

import { goalField } from '../http/goal-request';

/** The body of `POST /criteria`: derive a pipeline's rubric from a goal, into the room the caller has, and nothing else. */
export const criteriaRequestSchema = z.strictObject({
  pipeline: z.string().min(1),
  goal: goalField,
  room: z.number().int().min(1).optional(),
});
