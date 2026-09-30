import { MAX_PULL_DAYS, MIN_PULL_DAYS, type SaveSavedSearchRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import { queryFilterSchema } from '../../core/profile';

/** The body of `POST /profiles/:id/searches` and `PUT /searches/:id`. */
export const saveSavedSearchSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  filter: queryFilterSchema,
  days: z.number().int().min(MIN_PULL_DAYS).max(MAX_PULL_DAYS),
  includedInPull: z.boolean(),
  pullOrder: z.number().int().min(0).max(1000).default(0),
}) satisfies z.ZodType<SaveSavedSearchRequest>;
export type SaveSavedSearchBody = z.output<typeof saveSavedSearchSchema>;
