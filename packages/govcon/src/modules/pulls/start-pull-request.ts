import {
  MAX_PULL_DAYS,
  MIN_PULL_DAYS,
  type RunSearchRequest,
  type StartPullRequest,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { queryFilterSchema } from '../../core/profile';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const windowFields = {
  days: z.number().int().min(MIN_PULL_DAYS).max(MAX_PULL_DAYS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
};

/** The body of `POST /pulls`: the shape only — `resolveWindow` in core applies the window rule. */
export const startPullRequestSchema = z.strictObject({
  profile: z.string().min(1).optional(),
  ...windowFields,
}) satisfies z.ZodType<StartPullRequest>;
export type StartPullBody = z.output<typeof startPullRequestSchema>;

/** The body of `POST /searches/:id/run`: the window only; the search brings its own days. */
export const runSavedSearchSchema = z.strictObject(windowFields);
export type RunSavedSearchBody = z.output<typeof runSavedSearchSchema>;

/** The body of `POST /searches/run`: a filter run once, now, without saving it. */
export const runSearchRequestSchema = z.strictObject({
  profile: z.string().min(1).optional(),
  filter: queryFilterSchema,
  ...windowFields,
}) satisfies z.ZodType<RunSearchRequest>;
export type RunSearchBody = z.output<typeof runSearchRequestSchema>;
