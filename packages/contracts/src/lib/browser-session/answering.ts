/**
 * The answering settings a session runs under: what it types into a form
 * without asking the operator. `fills` says which kinds of evidence-backed
 * value are typed, by the one word each answer declares (`ANSWER_BASES`);
 * `drafts` says which kinds of suggested answer are typed for a field the
 * operator would otherwise be asked, by what each suggestion rests on
 * (`SUGGESTION_BASES`). A caller's risk, not the pipeline's judgement — the
 * pipelines say how a value rests and what a draft rests on, the settings say
 * which are good enough to type — so it lives beside the session's other
 * settings files, where changing it is a one-word edit and no code. Total by
 * construction: each table is typed against its vocabulary, so a kind the
 * vocabulary gains must be classified here before the contracts compile, and
 * a value resting on nothing is never filled.
 */
import { z } from 'zod';

import type { AnswerBasis, SuggestionBasis } from './vocab';

/** What the settings may say of a kind a value rests on: typed into the form, or put to the operator. */
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

/** What the settings may say of a suggestion's basis: typed into the form, or offered to the operator. */
const draftChoice = z.enum(['fill', 'offer']);

const drafts = {
  record: draftChoice,
  transfer: draftChoice,
  invented: draftChoice,
} satisfies Record<SuggestionBasis, typeof draftChoice>;

export const answeringSettingsSchema = z.strictObject({
  /** One choice per kind a value may rest on; `none` is always `ask`. */
  fills: z
    .strictObject(fills)
    .refine((table) => table.none === 'ask', 'a value resting on nothing is never filled'),
  /**
   * One choice per basis a suggestion may rest on: for a field the operator
   * would be asked, the first suggestion in lettering order — record, then
   * the drafts — whose basis is `fill` is typed instead, and the rest are
   * offered. A typed `invented` draft is experience the record does not hold,
   * submitted unseen: a choice to make knowingly.
   */
  drafts: z.strictObject(drafts),
});
export type AnsweringSettings = z.infer<typeof answeringSettingsSchema>;
