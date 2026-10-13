/**
 * Suggested answers: for every field of one form page put to the operator, a
 * few suggestions, each labelled by what it rests on — the record, the
 * subject's real adjacent work carried over, or experience the record does
 * not hold — as the `answer-suggestions` pipeline writes them. A chosen
 * suggestion becomes the operator's own answer, so the label is the point.
 * Faces a model, so nothing here is a number; the validators read the goal's
 * index for the bounds.
 */
import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { EVIDENCE_ALIAS, FIELDS_BOUND } from './field-answers.schema';
import { ELEMENT_REF } from './observation.schema';
import { SUGGESTION_BASES } from './vocab';

/** Up to this many per field — lettered a to d where the operator is asked. */
export const SUGGESTIONS_BOUND = bound(4, 'list');
/*
 * Measured 2026-10-13 on the pipeline's own runs (`answer-suggestions/
 * measured.json`, 46 runs, 113 suggestions): text ran to 613 characters,
 * cites to 3, why to 302, the summary to 810. The text bound is not the most
 * written and a fifth more: it is the length the model is told to write to,
 * and the goals' suggesting policy asks for two to four short paragraphs on
 * a question about the subject's experience — about 2,500 characters — where
 * 1,000 had every draft stop at a paragraph (max 613, 2026-10-13).
 */
const SUGGESTION_TEXT_BOUND = bound(2500);
const SUGGESTION_CITES_BOUND = bound(4, 'list');
const SUGGESTION_WHY_BOUND = bound(340);
const SUGGESTIONS_SUMMARY_BOUND = bound(880);

const suggestionSchema = z.strictObject({
  text: bounded.text(SUGGESTION_TEXT_BOUND, {
    min: 1,
    description: "The answer exactly as the operator would submit it, within the field's limits.",
  }),
  basis: z
    .enum(SUGGESTION_BASES)
    .describe(
      'record: states only what its cited evidence states. transfer: cites recorded work and says only how it carries over to what the field asks. invented: experience the record does not hold, offered only where the suggesting policy allows.',
    ),
  cites: bounded.list(SUGGESTION_CITES_BOUND, z.string().regex(EVIDENCE_ALIAS), {
    description:
      'The evidence aliases it rests on, exactly as listed: what a record suggestion states, the work a transfer carries over, what an invented draft is modelled on.',
  }),
  why: bounded.text(SUGGESTION_WHY_BOUND, {
    min: 1,
    description:
      'What it rests on; for a draft, what it is modelled on and what the operator must make true before choosing it.',
  }),
});

const fieldSuggestionsSchema = z.strictObject({
  ref: z.string().regex(ELEMENT_REF).describe('The field, exactly as the Fields list names it.'),
  suggestions: bounded.list(SUGGESTIONS_BOUND, suggestionSchema, {
    description:
      'Distinct suggestions, record first; empty when neither the record nor the suggesting policy supports one.',
  }),
});

export const answerSuggestionsSchema = z.strictObject({
  summary: bounded.text(SUGGESTIONS_SUMMARY_BOUND, {
    min: 1,
    description: 'What the fields ask and how the record covers them — two or three sentences.',
  }),
  fields: bounded.list(FIELDS_BOUND, fieldSuggestionsSchema, {
    min: 1,
    description: 'Every field the Fields list names, exactly once, in the order listed.',
  }),
});
export type AnswerSuggestions = z.infer<typeof answerSuggestionsSchema>;
