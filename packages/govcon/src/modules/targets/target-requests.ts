import {
  AWARD_ID_SHAPE,
  DEFAULT_PIPELINE_LIMIT,
  MAX_PIPELINE_LIMIT,
  MAX_TARGET_CONTACT_LENGTH,
  MAX_TARGET_LABEL_LENGTH,
  MAX_TARGET_NOTES_LENGTH,
  TARGET_KINDS,
  TARGET_STAGES,
  UEI_SHAPE,
  type SaveTargetRequest,
  type TargetKind,
  type TargetStage,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** What a subject must be, per kind: a firm is its UEI, read in capitals; an award is the id its record is read by. */
const SUBJECT: Record<TargetKind, z.ZodType<string>> = {
  firm: z.string().toUpperCase().regex(UEI_SHAPE, 'a UEI is twelve letters and digits'),
  award: z.string().regex(AWARD_ID_SHAPE, 'an award id is one path segment'),
};

/** The `:kind/:subject` of a target's routes, the subject read as its kind requires. */
export const targetKeySchema = z
  .strictObject({ kind: z.enum(TARGET_KINDS), subject: z.string() })
  .transform((key, ctx) => {
    const subject = SUBJECT[key.kind].safeParse(key.subject);
    if (subject.success) return { kind: key.kind, subject: subject.data };
    ctx.addIssue({
      code: 'custom',
      path: ['subject'],
      message: subject.error.issues[0]?.message ?? 'not a subject of that kind',
    });
    return z.NEVER;
  });
export type TargetKeyInput = z.output<typeof targetKeySchema>;

/** Every stage of any kind; which of them a kind has is the service's to check, since the kind is in the path. */
const anyStage = z.enum(
  TARGET_KINDS.flatMap((kind): readonly TargetStage[] => TARGET_STAGES[kind]),
);

/** The body of `PUT /targets/:kind/:subject`. Omitted fields keep their stored value; the service merges. */
export const saveTargetSchema = z.strictObject({
  label: z.string().trim().min(1).max(MAX_TARGET_LABEL_LENGTH),
  stage: anyStage,
  notes: z.string().max(MAX_TARGET_NOTES_LENGTH).optional(),
  contact: z.string().trim().max(MAX_TARGET_CONTACT_LENGTH).optional(),
  reminderAt: z.iso.datetime({ offset: true }).nullable().optional(),
}) satisfies z.ZodType<SaveTargetRequest>;
export type SaveTargetBody = z.output<typeof saveTargetSchema>;

/** The query of `GET /targets`. */
export const listTargetsQuerySchema = z.strictObject({
  kind: z.enum(TARGET_KINDS).optional(),
  stage: anyStage.optional(),
  ...pageFields(MAX_PIPELINE_LIMIT, DEFAULT_PIPELINE_LIMIT),
});
export type ListTargetsQueryInput = z.output<typeof listTargetsQuerySchema>;
