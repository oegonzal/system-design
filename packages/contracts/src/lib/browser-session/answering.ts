/**
 * The answering settings a session runs under: which kinds of evidence-backed
 * value it types into a form without asking the operator, by the one word
 * each answer declares (`ANSWER_BASES`). A caller's risk, not the pipeline's
 * judgement — the pipeline says how a value rests, the settings say which
 * ways are good enough to type — so it lives beside the session's other
 * settings files, where changing it is a one-word edit and no code. Total by
 * construction: the table is typed against the vocabulary, so a kind the
 * vocabulary gains must be classified here before the contracts compile, and
 * a value resting on nothing is never filled.
 */
import { z } from 'zod';

import type { AnswerBasis } from './vocab';

/** What the settings may say of a kind: typed into the form, or put to the operator. */
const fillChoice = z.enum(['fill', 'ask']);

const fills = {
  stated: fillChoice,
  restated: fillChoice,
  derived: fillChoice,
  mapped: fillChoice,
  inferred: fillChoice,
  composed: fillChoice,
  policy: fillChoice,
  none: fillChoice,
} satisfies Record<AnswerBasis, typeof fillChoice>;

export const answeringSettingsSchema = z.strictObject({
  /** One choice per kind a value may rest on; `none` is always `ask`. */
  fills: z
    .strictObject(fills)
    .refine((table) => table.none === 'ask', 'a value resting on nothing is never filled'),
});
export type AnsweringSettings = z.infer<typeof answeringSettingsSchema>;
