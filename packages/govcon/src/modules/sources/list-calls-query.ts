import { DEFAULT_CALL_LIMIT, MAX_CALL_LIMIT, SOURCE_OPERATIONS } from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** The query of `GET /source/calls`. */
export const listCallsQuerySchema = z.strictObject({
  operation: z.enum(SOURCE_OPERATIONS).optional(),
  ...pageFields(MAX_CALL_LIMIT, DEFAULT_CALL_LIMIT),
});
export type ListCallsQueryInput = z.output<typeof listCallsQuerySchema>;
