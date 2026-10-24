import { TARGET_KINDS, type StartIntroductionRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import { awardIdSchema } from '../spending/spending-requests';
import { targetKeySchema } from '../targets/target-requests';

/** The body of `POST /introductions`: the target the note is for, read as its kind requires, and the program it is about. */
export const startIntroductionSchema = z
  .strictObject({
    kind: z.enum(TARGET_KINDS),
    subject: z.string(),
    awardExternalId: awardIdSchema,
    profile: z.string().min(1).optional(),
  })
  .transform((body, ctx) => {
    const key = targetKeySchema.safeParse({ kind: body.kind, subject: body.subject });
    if (key.success) return { ...body, ...key.data };
    ctx.addIssue({
      code: 'custom',
      path: ['subject'],
      message: key.error.issues[0]?.message ?? 'not a subject of that kind',
    });
    return z.NEVER;
  }) satisfies z.ZodType<StartIntroductionRequest, unknown>;
export type StartIntroductionBody = z.output<typeof startIntroductionSchema>;
