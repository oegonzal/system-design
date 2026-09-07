import { z } from 'zod';

export { listRunsQuerySchema, type ListRunsQuery } from '../runs/list-runs-query';
/** The same inputs as `POST /runs`: the pipeline is the target. */
export { runRequestSchema } from '../runs/run-request';

/** The HTTP body of `POST /memory-runs/digest`: an already persisted run to learn from. */
export const digestRequestSchema = z.strictObject({ runId: z.string().min(1).max(80) });
