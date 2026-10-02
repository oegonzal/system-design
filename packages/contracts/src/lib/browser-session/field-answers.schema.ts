/**
 * Field answers: every field of one form page, each answered from the
 * evidence the goal lists, routed to the operator, or left blank — as the
 * `field-answer` pipeline writes them. Faces a model, so nothing here is a
 * number; the pipeline's validators read the goal's index for the bounds.
 */
import { z } from 'zod';

import { ELEMENT_REF } from './observation.schema';
import { CONFIDENCE_LEVELS, FIELD_DECISIONS } from './vocab';

export const MAX_FIELDS = 40;
export const MAX_BASIS = 6;
export const ANSWERS_SUMMARY_MAX_LENGTH = 600;
export const ANSWER_VALUE_MAX_LENGTH = 4000;
export const ANSWER_REASON_MAX_LENGTH = 300;

/** An evidence alias as the goal lists it: `m3`. */
export const EVIDENCE_ALIAS = /^m\d+$/;
export const evidenceAlias = (position: number): string => `m${position + 1}`;

export const fieldAnswerSchema = z.strictObject({
  ref: z.string().regex(ELEMENT_REF).describe('The field, exactly as the Fields list names it.'),
  decision: z
    .enum(FIELD_DECISIONS)
    .describe(
      'answer: fill it from the evidence. ask-operator: the evidence does not settle it. leave-blank: the page hides it, or it must stay empty.',
    ),
  value: z
    .string()
    .max(ANSWER_VALUE_MAX_LENGTH)
    .nullable()
    .describe('The exact text to type or the option to pick; null unless the decision is answer.'),
  confidence: z.enum(CONFIDENCE_LEVELS),
  basis: z
    .array(z.string().regex(EVIDENCE_ALIAS))
    .max(MAX_BASIS)
    .describe(
      'The evidence aliases the value rests on, exactly as listed; empty when none supports it.',
    ),
  reason: z.string().min(1).max(ANSWER_REASON_MAX_LENGTH),
});
export type FieldAnswer = z.infer<typeof fieldAnswerSchema>;

export const fieldAnswersSchema = z.strictObject({
  summary: z
    .string()
    .min(1)
    .max(ANSWERS_SUMMARY_MAX_LENGTH)
    .describe('What the form asks and how the evidence covers it — two or three sentences.'),
  fields: z
    .array(fieldAnswerSchema)
    .min(1)
    .max(MAX_FIELDS)
    .describe('Every field the Fields list names, exactly once, in the order listed.'),
});
export type FieldAnswers = z.infer<typeof fieldAnswersSchema>;
