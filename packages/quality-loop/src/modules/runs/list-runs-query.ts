import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, QUALITY_RUN_STATUSES } from '@sysdesign/contracts';
import { z } from 'zod';

/** The query of `GET /runs`. Coercion belongs here, at the HTTP edge — never in core/. */
export const listRunsQuerySchema = z.strictObject({
  pipeline: z.string().min(1).optional(),
  status: z.enum(QUALITY_RUN_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListRunsQuery = z.output<typeof listRunsQuerySchema>;
