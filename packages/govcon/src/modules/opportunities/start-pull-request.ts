import { MAX_PULL_DAYS, MIN_PULL_DAYS, type StartPullRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import { DEFAULT_PROFILE_ID } from '../../profiles';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The body of `POST /pulls`: the shape only — `resolveWindow` in core applies the window rule. */
export const startPullRequestSchema = z.strictObject({
  profile: z.string().min(1).default(DEFAULT_PROFILE_ID),
  days: z.number().int().min(MIN_PULL_DAYS).max(MAX_PULL_DAYS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
}) satisfies z.ZodType<StartPullRequest>;
export type StartPullBody = z.output<typeof startPullRequestSchema>;
