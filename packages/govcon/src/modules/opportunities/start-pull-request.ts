import { MAX_PULL_DAYS, MIN_PULL_DAYS, type StartPullRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import { DEFAULT_PROFILE_ID } from '../../profiles';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The body of `POST /pulls`: the last `days` days, or an explicit window — never both. */
export const startPullRequestSchema = z
  .strictObject({
    profile: z.string().min(1).default(DEFAULT_PROFILE_ID),
    days: z.number().int().min(MIN_PULL_DAYS).max(MAX_PULL_DAYS).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .superRefine((body, ctx) => {
    const explicit = body.from !== undefined || body.to !== undefined;
    if (explicit && (body.from === undefined || body.to === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from and to go together' });
    }
    if (explicit && body.days !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['days'],
        message: 'days and from/to are alternatives',
      });
    }
  }) satisfies z.ZodType<StartPullRequest>;
export type StartPullBody = z.output<typeof startPullRequestSchema>;
