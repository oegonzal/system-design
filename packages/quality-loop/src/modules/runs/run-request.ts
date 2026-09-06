import { z } from 'zod';

import { MAX_ITERATIONS } from './limits';

/** The HTTP body of `POST /runs`. `output` is any JSON; the pipeline's schema validator judges it. */
export const runRequestSchema = z.strictObject({
  pipeline: z.string().min(1),
  goal: z.string().min(1),
  output: z.unknown().optional(),
  maxIterations: z.number().int().min(1).max(MAX_ITERATIONS).optional(),
});
