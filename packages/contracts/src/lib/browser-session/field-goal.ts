/**
 * The goal codec of the form pipelines — `field-answer` and
 * `answer-suggestions`. The session composes the prose — the mission and the
 * unit of work — lists the fields and names in the index the unit the page is
 * for; the form-memory orchestrator splits that goal, recalls evidence for
 * the fields — of what was recorded for one unit of work, only the unit the
 * index names — and composes it again with the evidence listed, for the
 * pipeline the index names. Every stage reads the evidence; the validators
 * read the index.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import { quoted, quotedJson } from '../text';
import {
  DOCUMENT_MEMORY_KIND_USES,
  DOCUMENT_MEMORY_KINDS,
  MEMORY_SCOPE_USES,
  MEMORY_SCOPES,
  UNIT_BOUND_SCOPES,
  type MemoryScope,
} from '../quality-loop/document-digest';
import {
  GOAL_BUDGET_BYTES,
  readFencedIndex,
  renderIndexSection,
  withinBudget,
} from '../quality-loop/goal-index';
import type { Severity } from '../quality-loop/vocab';
import { unitKeySchema } from '../units/identity';
import { SUGGESTIONS_BOUND } from './answer-suggestions.schema';
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
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  FIELD_ANSWER_PIPELINE_ID,
  FORM_PIPELINES,
  type FormPipeline,
} from './pipelines';
import { ANSWER_BASES, ANSWER_BASIS_MEANINGS, HIDDEN_TRAITS, type FieldType } from './vocab';

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

/** A field's control kind by its role, where the role settles it. */
const FIELD_TYPE_BY_ROLE: Readonly<Record<string, FieldType>> = {
  searchbox: 'text',
  spinbutton: 'number',
  combobox: 'select',
  listbox: 'select',
  radiogroup: 'radio',
  radio: 'radio',
  checkbox: 'checkbox',
};

/** A field's control kind by its input type, for a role that does not settle it. */
const FIELD_TYPE_BY_INPUT: Readonly<Record<string, FieldType>> = {
  number: 'number',
  date: 'date',
  file: 'file',
  select: 'select',
  textarea: 'textarea',
  checkbox: 'checkbox',
  radio: 'radio',
};

/**
 * What kind of control asks: the role where it settles it, else the input
 * type, else a textbox is text and anything else unknown. Read by the
 * operator's prompt, the guidance record and the recall's budget per field,
 * so all three agree on what a field is.
 */
export function fieldTypeOf(field: Pick<FieldSpec, 'role' | 'inputType'>): FieldType {
  const byRole = FIELD_TYPE_BY_ROLE[field.role];
  if (byRole !== undefined) return byRole;
  if (field.inputType !== null) return FIELD_TYPE_BY_INPUT[field.inputType] ?? 'text';
  return field.role === 'textbox' ? 'text' : 'unknown';
}

const tidy = (text: string | null): string => text?.replace(/\s+/g, ' ').trim() ?? '';

/**
 * What a field asks, in the words the form uses: its label, then the words
 * beside it — the question a radio group's answers are named after — as one
 * sentence; null for a field that asks nothing it can be told by, which is
 * never taken for another. The one key for the field: the session's cache is
 * kept by it, a taught answer's condition is written as it, and the recall's
 * probe is searched with it, so the stored condition and the next probe are
 * the same text. Measured 2026-10-10: every radio question of a form had an
 * empty name, so an answer the operator gave to one stood in for three
 * questions on the next form they never saw.
 */
export const fieldQuestionOf = (field: Pick<FieldSpec, 'name' | 'context'>): string | null => {
  const question = [tidy(field.name), tidy(field.context)]
    .filter((part) => part.length > 0)
    .join('. ');
  return question === '' ? null : question;
};

/**
 * What a person would call the field, for a capture's name and an entry's
 * record: its label, else the words beside it, else nothing. Not the key —
 * a name that reads well is a different thing from the one text a probe is
 * searched with.
 */
export const fieldLabelOf = (field: Pick<FieldSpec, 'name' | 'context'>): string | null =>
  tidy(field.name) !== ''
    ? tidy(field.name)
    : tidy(field.context) !== ''
      ? tidy(field.context)
      : null;

/**
 * The options a value for the field must be one of: its listed ones when the
 * page offers no more, else null — the list is open, and a value the page
 * offers past it may stand. The one statement of a closed list, whoever the
 * value comes from: the answerer's validators and the operator's prompt.
 */
export const closedOptionsOf = (
  field: Pick<FieldSpec, 'options' | 'optionsOmitted'>,
): readonly string[] | null =>
  field.options !== null && field.optionsOmitted === 0 ? field.options : null;

/** A number input takes a number: not blank, and one `Number` reads whole. */
const isNumeric = (value: string): boolean =>
  value.trim().length > 0 && Number.isFinite(Number(value));

/**
 * What a value does that its field cannot take, in the order the page would
 * refuse it — the one statement of a field's limits, whoever writes the
 * value: an answer, a suggestion.
 */
export function valueFaults(
  field: FieldSpec,
  value: string,
): { severity: Severity; message: string }[] {
  const faults: { severity: Severity; message: string }[] = [];
  const { ref } = field;
  if (field.hiddenTraits.length > 0) {
    faults.push({
      severity: 'high',
      message: `${ref} is hidden (${field.hiddenTraits.join(', ')}); a field the page hides is given no value`,
    });
  }
  if (field.maxLength !== null && value.length > field.maxLength) {
    faults.push({
      severity: 'medium',
      message: `${ref} takes at most ${field.maxLength} characters; the value runs to ${value.length}`,
    });
  }
  const closed = closedOptionsOf(field);
  if (closed !== null && !closed.includes(value)) {
    faults.push({ severity: 'medium', message: `${quotedJson(value)} is not an option of ${ref}` });
  }
  if (field.inputType === 'number' && !isNumeric(value)) {
    faults.push({
      severity: 'medium',
      message: `${ref} takes a number; ${quotedJson(value)} is not one`,
    });
  }
  return faults;
}

/** One recalled fact, with where it came from, as the goal lists it. */
export const evidenceItemSchema = z.strictObject({
  alias: z.string().regex(EVIDENCE_ALIAS),
  text: z.string().min(1).max(EVIDENCE_TEXT_MAX_LENGTH),
  /** The day it was stored. */
  when: z.string().max(40),
  /** Where it holds: of the subject wherever asked, or of the one unit of work it was recorded for. */
  scope: z.enum(MEMORY_SCOPES),
  source: z.strictObject({
    runId: z.string().min(1).max(80),
    pipeline: z.string().min(1).max(80),
    ref: z.string().min(1).max(200),
    /** What the store holds it as: a fact, a story kept whole, or a bound on what the subject may claim. */
    kind: z.enum(DOCUMENT_MEMORY_KINDS),
  }),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export interface FieldGoalInput {
  /** The form pipeline the goal is for. */
  pipeline: FormPipeline;
  /** The mission and the unit of work, as the session composes them. */
  prose: string;
  fields: readonly FieldSpec[];
  evidence: readonly EvidenceItem[];
  /**
   * The unit of work the page is for, as its composer names it
   * (`unitKeyOf`); absent when none is open. The recall searches what was
   * recorded for one unit of work only for this one.
   */
  unitKey?: string;
}

const fieldIndexShape = {
  pipeline: z.enum(FORM_PIPELINES),
  fields: bounded.list(FIELDS_BOUND, fieldSpecSchema, { min: 1 }),
  evidence: z.array(z.strictObject({ alias: z.string().regex(EVIDENCE_ALIAS) })).max(MAX_EVIDENCE),
  /** Written only when the page names its unit, so a goal that names none reads as before one could. */
  unitKey: unitKeySchema.optional(),
};
export const fieldIndexSchema = z.strictObject(fieldIndexShape);
export type FieldIndex = z.infer<typeof fieldIndexSchema>;

/** The index of a goal for one form pipeline only: a pipeline's validators never read another's goal. */
export const fieldIndexSchemaFor = (pipeline: FormPipeline) =>
  z.strictObject({ ...fieldIndexShape, pipeline: z.literal(pipeline) });

export const FIELDS_HEADING = '## Fields to answer';
export const FIELD_EVIDENCE_HEADING = '## Evidence about the subject';

/** What each kind of evidence is, said once above the evidence so every stage reads the kind as declared. */
const KIND_LEGEND = `Kinds: ${DOCUMENT_MEMORY_KINDS.map((kind) => `${kind} — ${DOCUMENT_MEMORY_KIND_USES[kind]}`).join('; ')}.`;
/** Where each item holds, said once beside the kinds: a unit item is no evidence for another unit of work. */
const SCOPE_LEGEND = `Scopes: ${MEMORY_SCOPES.map((scope) => `${scope} — ${MEMORY_SCOPE_USES[scope]}`).join('; ')}. A unit item settles only a field about the unit of work this goal names.`;

/**
 * Said after the scopes when the goal names its unit, of the scopes bound to
 * a unit of work: the recall searched what was recorded for one unit only
 * under the key the index names — the unit's declared identity, else its own
 * id (`unitKeyOf`) — so every item of those scopes listed was recorded for a
 * unit its mission identifies as this one, which need not be this very unit.
 * Built from the table the recall's filter reads (`UNIT_BOUND_SCOPES`) and
 * said only when the index names the key the filter searched under, so the
 * sentence and the search cannot disagree — an item's text often names no
 * unit at all ("this organization"). Null when no scope is bound: the search
 * then leaves nothing out, and there is nothing to say.
 */
export const unitNamedLegend = (bound: readonly MemoryScope[]): string | null =>
  bound.length === 0
    ? null
    : `Every ${bound.join(' or ')} item listed was recorded for a unit of work its mission identifies as the one this goal names.`;

/** The scope legend this goal states. */
const scopeLegend = (input: FieldGoalInput): string => {
  const named = input.unitKey === undefined ? null : unitNamedLegend(UNIT_BOUND_SCOPES);
  return named === null ? SCOPE_LEGEND : `${SCOPE_LEGEND} ${named}`;
};

/** Each form pipeline's words for an empty evidence list, and its limits. */
const FORM_GOAL_TERMS: Readonly<
  Record<FormPipeline, { noEvidence: string; limits: readonly string[] }>
> = {
  [FIELD_ANSWER_PIPELINE_ID]: {
    noEvidence:
      '(none recalled: answer nothing about the subject from memory; route such fields to the operator)',
    limits: [
      '- Answer every listed field exactly once, by its ref, in the order listed.',
      "- A value stays within the field's character limit; a selectable field takes one of its listed options, or where the list counts more the page offers, one of those verbatim; a number field takes a number.",
      '- A field the page hides is left blank. A value about the subject rests only on listed evidence, cited by alias; with no evidence for it, ask the operator.',
      `- Each value declares how it rests on the evidence, by one word: ${ANSWER_BASES.map((kind) => `${kind} — ${ANSWER_BASIS_MEANINGS[kind]}`).join('; ')}. A value resting on the evidence cites it; a mapped value needs options to map onto; a keep, an ask or a blank rests on none.`,
      '- Validators check these limits; they are not criteria.',
    ],
  },
  [ANSWER_SUGGESTIONS_PIPELINE_ID]: {
    noEvidence:
      '(none recalled: no suggestion rests on the record; draft only where the suggesting policy allows, labelled as a draft)',
    limits: [
      `- Suggest for every listed field exactly once, by its ref, in the order listed: at most ${SUGGESTIONS_BOUND.target} suggestions each, none repeating another; a field nothing supports gets none.`,
      "- A suggestion stays within the field's character limit; a selectable field takes one of its listed options verbatim; a number field takes a number.",
      '- A record or transfer suggestion cites the listed evidence it rests on, by alias.',
      '- Validators check these limits; they are not criteria.',
    ],
  },
};

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
  `- [${item.alias}] ${item.source.kind} · ${item.scope} — ${item.text.trim()} · stored ${item.when} · ${item.source.pipeline} ${item.source.ref} (run ${item.source.runId})`;

const indexOf = (input: FieldGoalInput): FieldIndex => ({
  pipeline: input.pipeline,
  fields: [...input.fields],
  evidence: input.evidence.map((item) => ({ alias: item.alias })),
  ...(input.unitKey === undefined ? {} : { unitKey: input.unitKey }),
});

/** The goal, or a refusal when it would not fit the engine's budget. */
export function composeFieldGoal(input: FieldGoalInput, budget = GOAL_BUDGET_BYTES): string {
  const terms = FORM_GOAL_TERMS[input.pipeline];
  const goal = [
    input.prose.trim(),
    '',
    FIELDS_HEADING,
    '',
    ...input.fields.map(renderFieldLine),
    '',
    FIELD_EVIDENCE_HEADING,
    '',
    ...(input.evidence.length > 0
      ? [KIND_LEGEND, scopeLegend(input), '', ...input.evidence.map(evidenceLine)]
      : [terms.noEvidence]),
    '',
    '## Limits',
    '',
    ...terms.limits,
    '',
    renderIndexSection(indexOf(input)),
  ].join('\n');
  return withinBudget(goal, budget);
}

/** The index this codec wrote, or null for a goal no form pipeline's codec wrote. */
export const readFieldIndex = (goal: string): FieldIndex | null =>
  readFencedIndex(goal, fieldIndexSchema);

/**
 * A composed goal taken apart so it can be composed again with evidence: the
 * form pipeline it is for, the prose the session wrote, and the fields and
 * the unit of work from the index. Null for a goal this codec did not write.
 * The fields heading is searched from the end, so a mission that happens to
 * contain the same words is not mistaken for it.
 */
export function splitFieldGoal(goal: string): Omit<FieldGoalInput, 'evidence'> | null {
  const index = readFieldIndex(goal);
  if (index === null) return null;
  const marker = `\n${FIELDS_HEADING}\n`;
  const at = goal.lastIndexOf(marker);
  if (at < 0) return null;
  return {
    pipeline: index.pipeline,
    prose: goal.slice(0, at).trim(),
    fields: index.fields,
    ...(index.unitKey === undefined ? {} : { unitKey: index.unitKey }),
  };
}
