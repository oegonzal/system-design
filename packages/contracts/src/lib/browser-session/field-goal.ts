/**
 * The goal codec of the `field-answer` pipeline. The session composes the
 * prose — the mission's answering policy and the unit of work — and lists the
 * fields; the form-memory orchestrator splits that goal, recalls evidence for
 * the fields and composes it again with the evidence listed. Every stage reads
 * the evidence; the validators read the index.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import { quoted } from '../text';
import {
  GOAL_BUDGET_BYTES,
  readFencedIndex,
  renderIndexSection,
  withinBudget,
} from '../quality-loop/goal-index';
import { EVIDENCE_ALIAS, FIELDS_BOUND } from './field-answers.schema';
import {
  ELEMENT_NAME_BOUND,
  ELEMENT_REF,
  ELEMENT_VALUE_BOUND,
  INPUT_TYPE_MAX_LENGTH,
  OPTION_BOUND,
  OPTIONS_BOUND,
  ROLE_MAX_LENGTH,
  type ObservedElement,
} from './observation.schema';
import { FIELD_ANSWER_PIPELINE_ID } from './pipelines';
import { HIDDEN_TRAITS } from './vocab';

export const FIELD_CONTEXT_MAX_LENGTH = 300;
export const EVIDENCE_TEXT_MAX_LENGTH = 1200;
export const MAX_EVIDENCE = 24;

/** One form field as the model and the validators see it: the element's facts, plus the text beside it. */
export const fieldSpecSchema = z.strictObject({
  ref: z.string().regex(ELEMENT_REF),
  role: bounded.id(ROLE_MAX_LENGTH, { min: 1 }),
  name: bounded.text(ELEMENT_NAME_BOUND),
  inputType: bounded.id(INPUT_TYPE_MAX_LENGTH).nullable(),
  options: bounded.list(OPTIONS_BOUND, bounded.text(OPTION_BOUND)).nullable(),
  /** Options the page offers past the listed ones, counted; the validators hold a value to the list only when this is zero. */
  optionsOmitted: z.number().int().min(0),
  /**
   * What the field holds as the page stands — a site fills what it knows
   * before anyone types. Measured 2026-10-07: a contact page arrived with its
   * three fields filled and was asked thirty-two times, the answerer never
   * told they held anything.
   */
  value: bounded.text(ELEMENT_VALUE_BOUND).nullable(),
  required: z.boolean(),
  /** Whether the page marks it invalid: what a refused Next points at. */
  invalid: z.boolean(),
  maxLength: z.number().int().positive().nullable(),
  hiddenTraits: z.array(z.enum(HIDDEN_TRAITS)).max(HIDDEN_TRAITS.length),
  context: z.string().max(FIELD_CONTEXT_MAX_LENGTH).nullable(),
});
export type FieldSpec = z.infer<typeof fieldSpecSchema>;

/** An element the plan asked about, as a field. */
export const fieldSpecOf = (element: ObservedElement): FieldSpec => ({
  ref: element.ref,
  role: element.role,
  name: element.name,
  inputType: element.inputType,
  options: element.options,
  optionsOmitted: element.optionsOmitted,
  value: element.value,
  required: element.required,
  invalid: element.invalid,
  maxLength: element.maxLength,
  hiddenTraits: element.hiddenTraits,
  context: element.context,
});

/** One recalled fact, with where it came from, as the goal lists it. */
export const evidenceItemSchema = z.strictObject({
  alias: z.string().regex(EVIDENCE_ALIAS),
  text: z.string().min(1).max(EVIDENCE_TEXT_MAX_LENGTH),
  /** The day it was stored. */
  when: z.string().max(40),
  source: z.strictObject({
    runId: z.string().min(1).max(80),
    pipeline: z.string().min(1).max(80),
    ref: z.string().min(1).max(200),
  }),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export interface FieldGoalInput {
  /** The mission's answering policy and the unit of work, as the session composes them. */
  prose: string;
  fields: readonly FieldSpec[];
  evidence: readonly EvidenceItem[];
}

export const fieldIndexSchema = z.strictObject({
  pipeline: z.literal(FIELD_ANSWER_PIPELINE_ID),
  fields: bounded.list(FIELDS_BOUND, fieldSpecSchema, { min: 1 }),
  evidence: z.array(z.strictObject({ alias: z.string().regex(EVIDENCE_ALIAS) })).max(MAX_EVIDENCE),
});
export type FieldIndex = z.infer<typeof fieldIndexSchema>;

export const FIELDS_HEADING = '## Fields to answer';
export const FIELD_EVIDENCE_HEADING = '## Evidence about the subject';
const NO_EVIDENCE =
  '(none recalled: answer nothing about the subject from memory; route such fields to the operator)';

export function renderFieldLine(field: FieldSpec): string {
  const parts = [field.ref, `${field.role} ${quoted(field.name)}`];
  if (field.inputType !== null) parts.push(`type ${field.inputType}`);
  if (field.options !== null) {
    parts.push(
      `options: ${field.options.join(' | ')}${field.optionsOmitted > 0 ? ` (${field.optionsOmitted} more the page offers)` : ''}`,
    );
  }
  if (field.value !== null && field.value !== '') parts.push(`holds ${quoted(field.value)} now`);
  if (field.required) parts.push('required');
  if (field.invalid) parts.push('marked invalid by the page');
  if (field.maxLength !== null) parts.push(`at most ${field.maxLength} characters`);
  if (field.hiddenTraits.length > 0) parts.push(`hidden: ${field.hiddenTraits.join(', ')}`);
  if (field.context !== null && field.context !== '')
    parts.push(`context ${quoted(field.context)}`);
  return `- ${parts.join(' · ')}`;
}

const evidenceLine = (item: EvidenceItem): string =>
  `- [${item.alias}] ${item.text.trim()} · stored ${item.when} · ${item.source.pipeline} ${item.source.ref} (run ${item.source.runId})`;

const indexOf = (input: FieldGoalInput): FieldIndex => ({
  pipeline: FIELD_ANSWER_PIPELINE_ID,
  fields: [...input.fields],
  evidence: input.evidence.map((item) => ({ alias: item.alias })),
});

/** The goal, or a refusal when it would not fit the engine's budget. */
export function composeFieldGoal(input: FieldGoalInput, budget = GOAL_BUDGET_BYTES): string {
  const goal = [
    input.prose.trim(),
    '',
    FIELDS_HEADING,
    '',
    ...input.fields.map(renderFieldLine),
    '',
    FIELD_EVIDENCE_HEADING,
    '',
    ...(input.evidence.length > 0 ? input.evidence.map(evidenceLine) : [NO_EVIDENCE]),
    '',
    '## Limits',
    '',
    '- Answer every listed field exactly once, by its ref, in the order listed.',
    "- A value stays within the field's character limit; a selectable field takes one of its listed options, or where the list counts more the page offers, one of those verbatim; a number field takes a number.",
    '- A field the page hides is left blank. A value about the subject rests only on listed evidence, cited by alias; with no evidence for it, ask the operator.',
    '- Validators check these limits; they are not criteria.',
    '',
    renderIndexSection(indexOf(input)),
  ].join('\n');
  return withinBudget(goal, budget);
}

/** The index this codec wrote, or null for a goal that is not a field-answer goal. */
export const readFieldIndex = (goal: string): FieldIndex | null =>
  readFencedIndex(goal, fieldIndexSchema);

/**
 * A composed goal taken apart so it can be composed again with evidence: the
 * prose the session wrote and the fields from the index. Null for a goal this
 * codec did not write. The fields heading is searched from the end, so a
 * mission that happens to contain the same words is not mistaken for it.
 */
export function splitFieldGoal(goal: string): { prose: string; fields: FieldSpec[] } | null {
  const index = readFieldIndex(goal);
  if (index === null) return null;
  const marker = `\n${FIELDS_HEADING}\n`;
  const at = goal.lastIndexOf(marker);
  if (at < 0) return null;
  return { prose: goal.slice(0, at).trim(), fields: index.fields };
}
