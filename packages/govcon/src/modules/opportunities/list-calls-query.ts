import { DEFAULT_CALL_LIMIT, MAX_CALL_LIMIT } from '@sysdesign/contracts';
import { z } from 'zod';

/** The query of `GET /source/calls`. */
export const listCallsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_CALL_LIMIT).default(DEFAULT_CALL_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListCallsQueryInput = z.output<typeof listCallsQuerySchema>;
