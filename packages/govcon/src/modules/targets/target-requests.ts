import {
  AWARD_ID_SHAPE,
  DEFAULT_PIPELINE_LIMIT,
  MAX_PIPELINE_LIMIT,
  MAX_TARGET_ACTIVITY,
  MAX_TARGET_CONTACTS,
  MAX_TARGET_LABEL_LENGTH,
  MAX_TARGET_LINKS,
  MAX_TARGET_NEXT_ACTION_LENGTH,
  MAX_TARGET_NOTES_LENGTH,
  MAX_TARGET_TEXT_LENGTH,
  MAX_TARGET_URL_LENGTH,
  TARGET_ACTIVITY_KINDS,
  TARGET_CONTACT_ROLES,
  TARGET_KINDS,
  TARGET_LINK_KINDS,
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

const words = z.string().trim().max(MAX_TARGET_TEXT_LENGTH);

/** Someone to reach: named, in a declared role, reached somehow, with a note. */
const contactSchema = z.strictObject({
  name: words.pipe(z.string().min(1)),
  role: z.enum(TARGET_CONTACT_ROLES),
  channel: words,
  note: words,
});

/** A page kept on the target: a web address, of a declared kind, with a label. */
const linkSchema = z.strictObject({
  kind: z.enum(TARGET_LINK_KINDS),
  url: z.url({ protocol: /^https?$/ }).max(MAX_TARGET_URL_LENGTH),
  label: words,
});

/** One thing done, when, of a declared kind, in a line. */
const activitySchema = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  kind: z.enum(TARGET_ACTIVITY_KINDS),
  summary: words,
});

/** The body of `PUT /targets/:kind/:subject`. Omitted fields keep their stored value; the service merges, and a list given replaces the whole list. */
export const saveTargetSchema = z.strictObject({
  label: z.string().trim().min(1).max(MAX_TARGET_LABEL_LENGTH),
  stage: anyStage,
  notes: z.string().max(MAX_TARGET_NOTES_LENGTH).optional(),
  nextAction: z.string().trim().max(MAX_TARGET_NEXT_ACTION_LENGTH).optional(),
  contacts: z.array(contactSchema).max(MAX_TARGET_CONTACTS).optional(),
  links: z.array(linkSchema).max(MAX_TARGET_LINKS).optional(),
  activity: z.array(activitySchema).max(MAX_TARGET_ACTIVITY).optional(),
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
