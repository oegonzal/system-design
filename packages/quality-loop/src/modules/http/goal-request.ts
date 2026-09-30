/**
 * The body of the tools that take a goal and nothing else — the retrieval
 * report, the route report. Capped in characters at the edge; the engine's
 * own byte budget applies once a goal reaches a stage.
 */
import { z } from 'zod';

export const MAX_GOAL_LENGTH = 64_000;

export const goalRequestSchema = z.strictObject({ goal: z.string().min(1).max(MAX_GOAL_LENGTH) });
