import { DEFAULT_CALL_LIMIT, MAX_CALL_LIMIT, SOURCE_OPERATIONS } from '@sysdesign/contracts';
import { z } from 'zod';

/** The query of `GET /source/calls`. */
export const listCallsQuerySchema = z.strictObject({
  operation: z.enum(SOURCE_OPERATIONS).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_CALL_LIMIT).default(DEFAULT_CALL_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListCallsQueryInput = z.output<typeof listCallsQuerySchema>;
