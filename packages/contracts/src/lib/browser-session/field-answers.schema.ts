/**
 * Field answers: every field of one form page, each answered from the
 * evidence the goal lists, routed to the operator, or left blank — as the
 * `field-answer` pipeline writes them. Faces a model, so nothing here is a
 * number; the pipeline's validators read the goal's index for the bounds.
 */
import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { MEMORY_SCOPES } from '../units/scope';
import { ELEMENT_REF } from './observation.schema';
import { ANSWER_BASES, ANSWER_BASIS_MEANINGS, FIELD_DECISIONS } from './vocab';

export const FIELDS_BOUND = bound(40, 'list');
export const BASIS_BOUND = bound(6, 'list');
/** Measured 2026-10-13 over 121 runs: p99 707, max 713 — a summary of two or three sentences over a long page. */
export const ANSWERS_SUMMARY_BOUND = bound(750);
export const ANSWER_VALUE_BOUND = bound(4000);
/** Measured 2026-10-13 over 121 runs: p99 306, max 399, since a reason also says how the value rests on the evidence. */
export const ANSWER_REASON_BOUND = bound(450);

/** An evidence alias as the goal lists it: `m3`. */
export const EVIDENCE_ALIAS = /^m\d+$/;
export const evidenceAlias = (position: number): string => `m${position + 1}`;

export const fieldAnswerSchema = z.strictObject({
  ref: z.string().regex(ELEMENT_REF).describe('The field, exactly as the Fields list names it.'),
  /**
   * Where an answer to what this field asks holds, declared whatever the
   * decision: an operator's answer to a field the model could not settle is
   * taught under the scope declared here, so the question's scope is judged
   * even when its answer is not known.
   */
  about: z
    .enum(MEMORY_SCOPES)
    .describe(
      'Where an answer to what this field asks holds, whatever the decision. subject: the same whoever asks — the record, experience, skills, documents, status, or a standing answer to a question any form may ask. unit: it would differ for another employer, role or application — working or knowing someone there, consents, how this opening was heard of, whether it suits.',
    ),
  decision: z
    .enum(FIELD_DECISIONS)
    .describe(
      'answer: fill it from the evidence. keep: what the Fields list says it holds now is right, and it stays as it is. ask-operator: the evidence does not settle it. leave-blank: the page hides it, or it must stay empty.',
    ),
  value: bounded
    .text(ANSWER_VALUE_BOUND, {
      description:
        'The exact text to type or the option to pick; null unless the decision is answer.',
    })
    .nullable(),
  rests: z
    .enum(ANSWER_BASES)
    .describe(
      `How the value rests on the evidence. ${ANSWER_BASES.map((kind) => `${kind}: ${ANSWER_BASIS_MEANINGS[kind]}`).join(' | ')}. A keep, an ask or a blank rests on none.`,
    ),
  basis: bounded.list(BASIS_BOUND, z.string().regex(EVIDENCE_ALIAS), {
    description:
      'The evidence aliases the value rests on, exactly as listed; empty when none supports it.',
  }),
  reason: bounded.text(ANSWER_REASON_BOUND, { min: 1 }),
});
export type FieldAnswer = z.infer<typeof fieldAnswerSchema>;

export const fieldAnswersSchema = z.strictObject({
  summary: bounded.text(ANSWERS_SUMMARY_BOUND, {
    min: 1,
    description: 'What the form asks and how the evidence covers it — two or three sentences.',
  }),
  fields: bounded.list(FIELDS_BOUND, fieldAnswerSchema, {
    min: 1,
    description: 'Every field the Fields list names, exactly once, in the order listed.',
  }),
});
export type FieldAnswers = z.infer<typeof fieldAnswersSchema>;
