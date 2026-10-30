/**
 * The goal codec of the form pipelines — `field-answer` and
 * `answer-suggestions`. The session composes the prose — the mission and the
 * unit of work — lists the fields and names in the index the unit the page is
 * for; a recall splits that goal, finds evidence for the fields — of what was
 * recorded for one unit of work, only the unit the index names — and composes
 * it again with the evidence listed under the legend of its kinds, for the
 * pipeline the index names. Every stage reads the evidence; the validators
 * read the index; and the evidence is read back from the goal by the codec
 * that wrote it (`readEvidenceItems`), never by a reading of prose.
 */
import { z } from 'zod';

import { REGISTER_NAME_BOUND } from '../agentic-system/strategy';
import { bounded, keptAtMost } from '../bounds';
import {
  GOAL_BUDGET_BYTES,
  readFencedIndex,
  renderIndexSection,
  withinBudget,
} from '../quality-loop/goal-index';
import { SOURCE_ID_MAX_LENGTH, SOURCE_REF_MAX_LENGTH } from '../quality-loop/memory';
import type { Severity } from '../quality-loop/vocab';
import { excerpt, quoted, quotedJson } from '../text';
import { unitKeySchema } from '../units/identity';
import { MEMORY_SCOPES } from '../units/scope';
import { EVIDENCE_ALIAS, FIELDS_BOUND } from './field-answers.schema';
import { FORM_GOAL_TERMS, kindsLegend, scopeLegend } from './field-goal-terms';
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
import { FORM_PIPELINES, type FormPipeline } from './pipelines';
import { HIDDEN_TRAITS, type FieldType } from './vocab';

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

/** What a line's parts are joined by — a field's facts, an item's head and tail. */
const SEPARATOR = ' · ';
/**
 * One line, no whitespace at either end — an item's text, kind and when, a
 * legend's kind and use: the goal lists each on one line and `EVIDENCE_LINE`
 * reads it back from one, so none of the four line terminators `.` stops at.
 */
const ONE_LINE = /^\S(?:[^\n\r\u2028\u2029]*\S)?$/;
/** Where an item came from is written as tokens, so the line's tail reads back by its spaces. */
const TOKEN = /^\S+$/;
/** What the store holds an item as, by the name the legend explains: any register name a lenient read of a strategy can hold. */
const kindSchema = bounded.id(keptAtMost(REGISTER_NAME_BOUND), { min: 1 });
/**
 * The longest address an origin writes today — a run id, `#`, a ref within
 * the run, each at the bound the store declares — which a record id and its
 * version fit within.
 */
const EVIDENCE_REF_MAX_LENGTH = SOURCE_ID_MAX_LENGTH + 1 + SOURCE_REF_MAX_LENGTH;

/** A stored text as an evidence item carries it: one line, within the item's bound, a cut marked. */
export const evidenceText = (text: string): string => excerpt(tidy(text), EVIDENCE_TEXT_MAX_LENGTH);

/**
 * One recalled fact, with where it came from, as the goal lists it. The kind
 * is what the store holds it as — a document memory's kind, a register's name
 * — explained by the goal's legend (`FieldGoalInput.kinds`); the source names
 * the program that wrote it and its address there, so a reader finds the fact
 * again or retracts it. Every part but the text keeps clear of the line's
 * separators, so the line reads back exactly whatever the text holds.
 */
export const evidenceItemSchema = z
  .strictObject({
    alias: z.string().regex(EVIDENCE_ALIAS),
    text: z.string().min(1).max(EVIDENCE_TEXT_MAX_LENGTH).regex(ONE_LINE),
    /** The day it was stored. */
    when: z.string().max(40),
    /** Where it holds: of the subject wherever asked, or of the one unit of work it was recorded for. */
    scope: z.enum(MEMORY_SCOPES),
    kind: kindSchema,
    source: z.strictObject({
      /** The program that wrote it: a pipeline's id, a provenance source. */
      origin: bounded.id(120, { min: 1 }),
      /** Its address there: `<runId>#<ref>`, `<recordId>@v<version>`. */
      ref: bounded.id(EVIDENCE_REF_MAX_LENGTH, { min: 1 }),
    }),
  })
  .refine(
    (item) =>
      [item.kind, item.when].every((part) => ONE_LINE.test(part) && !part.includes(SEPARATOR)) &&
      TOKEN.test(item.source.origin) &&
      TOKEN.test(item.source.ref),
    {
      message: `the kind and the when are one line each holding no ${quotedJson(SEPARATOR)}, and the origin and the ref are one token each, so the line reads back`,
    },
  );
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/**
 * The legend as the goal admits it: each kind within an item's own bound and
 * each use one line, so a legend line reads as the one line it is and never
 * as an item or the end of the section. The composer's own data, bounded by
 * the goal's budget; never a model's.
 */
const kindsLegendSchema = z.array(
  z
    .strictObject({ kind: kindSchema, use: z.string().min(1) })
    .refine((entry) => ONE_LINE.test(entry.kind) && ONE_LINE.test(entry.use), {
      message: 'a legend entry is one line for its kind and one for its use',
    }),
);

export interface FieldGoalInput {
  /** The form pipeline the goal is for. */
  pipeline: FormPipeline;
  /** The mission and the unit of work, as the session composes them. */
  prose: string;
  fields: readonly FieldSpec[];
  evidence: readonly EvidenceItem[];
  /**
   * The kinds the evidence may be of, each with what it is for, as the store
   * declares them — a digest's memory kinds, a space's registers — and as the
   * legend over the items explains them. Every item's kind is listed here, so
   * every stage reads a kind as declared and none argues it from the item;
   * a goal composing no evidence lists none.
   */
  kinds: readonly { kind: string; use: string }[];
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
const LIMITS_HEADING = '## Limits';

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
  return `- ${parts.join(SEPARATOR)}`;
}

/** An item on one line: a fixed head, the text, a fixed tail — what `readEvidenceLine` reads back. */
const evidenceLine = (item: EvidenceItem): string =>
  `- [${item.alias}] ${item.kind}${SEPARATOR}${item.scope} — ${item.text}${SEPARATOR}stored ${item.when}${SEPARATOR}${item.source.origin} ${item.source.ref}`;

/**
 * The items as the goal admits them, under a legend it admits: each item the
 * schema's, of a kind the legend explains, each legend entry one line. All
 * three are the composer's to get right, so each refusal is named.
 */
function admittedEvidence(input: FieldGoalInput): EvidenceItem[] {
  const legend = kindsLegendSchema.safeParse(input.kinds);
  if (!legend.success) {
    const faults = legend.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`the kinds legend is not one the goal lists: ${faults}`);
  }
  const explained = new Set(legend.data.map((entry) => entry.kind));
  return input.evidence.map((item) => {
    const parsed = evidenceItemSchema.safeParse(item);
    if (!parsed.success) {
      const faults = parsed.error.issues.map((issue) => issue.message).join('; ');
      throw new Error(`evidence ${item.alias} is not an item the goal lists: ${faults}`);
    }
    if (!explained.has(parsed.data.kind)) {
      throw new Error(`evidence ${item.alias} is of a kind the legend does not list: ${item.kind}`);
    }
    return parsed.data;
  });
}

const indexOf = (input: FieldGoalInput): FieldIndex => ({
  pipeline: input.pipeline,
  fields: [...input.fields],
  evidence: input.evidence.map((item) => ({ alias: item.alias })),
  ...(input.unitKey === undefined ? {} : { unitKey: input.unitKey }),
});

/** The goal, or a refusal when it would not fit the engine's budget. */
export function composeFieldGoal(input: FieldGoalInput, budget = GOAL_BUDGET_BYTES): string {
  const terms = FORM_GOAL_TERMS[input.pipeline];
  const evidence = admittedEvidence(input);
  const goal = [
    input.prose.trim(),
    '',
    FIELDS_HEADING,
    '',
    ...input.fields.map(renderFieldLine),
    '',
    FIELD_EVIDENCE_HEADING,
    '',
    ...(evidence.length > 0
      ? [kindsLegend(input.kinds), scopeLegend(input.unitKey), '', ...evidence.map(evidenceLine)]
      : [terms.noEvidence]),
    '',
    LIMITS_HEADING,
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
export function splitFieldGoal(goal: string): Omit<FieldGoalInput, 'evidence' | 'kinds'> | null {
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

const EVIDENCE_MARKER = `\n${FIELD_EVIDENCE_HEADING}\n`;
const LIMITS_MARKER = `\n${LIMITS_HEADING}\n`;
/**
 * An item's line as `evidenceLine` writes it. The head ends at the first scope
 * word between the separators, the tail begins at the last `stored` the rest
 * of the line reads as a tail after — so the text between them may hold any of
 * those words and separators and still reads back whole.
 */
const EVIDENCE_LINE = new RegExp(
  `^- \\[([^\\]]+)\\] (.+?)${SEPARATOR}(${MEMORY_SCOPES.join('|')}) — (.*)${SEPARATOR}stored (.*?)${SEPARATOR}(\\S+) (\\S+)$`,
);

/** One item from the line this codec wrote for it; a line of any other shape is refused by name. */
function readEvidenceLine(line: string): EvidenceItem {
  const match = EVIDENCE_LINE.exec(line);
  if (match === null) throw new Error(`not an evidence line this codec wrote: ${quotedJson(line)}`);
  const [, alias, kind, scope, text, when, origin, ref] = match;
  const parsed = evidenceItemSchema.safeParse({
    alias,
    text,
    when,
    scope,
    kind,
    source: { origin, ref },
  });
  if (!parsed.success) {
    const faults = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`not an evidence item this codec wrote: ${quotedJson(line)} — ${faults}`);
  }
  return parsed.data;
}

/**
 * The evidence a goal lists, read back from the lines this codec wrote — the
 * inverse of `composeFieldGoal` over its evidence section, never a reading of
 * prose. The section runs from the evidence heading to the Limits; its item
 * lines are the ones that begin as a list item, and they must be the items
 * the index lists, every alias in order, or the read is refused rather than
 * half done — an index listing items over no section is refused the same
 * way. Empty for a goal listing none, and for one this codec did not write.
 */
export function readEvidenceItems(goal: string): EvidenceItem[] {
  const index = readFieldIndex(goal);
  if (index === null) return [];
  const listed = index.evidence.map((entry) => entry.alias).join(' ');
  const at = goal.lastIndexOf(EVIDENCE_MARKER);
  const end = at < 0 ? -1 : goal.indexOf(LIMITS_MARKER, at + EVIDENCE_MARKER.length);
  if (end < 0) {
    if (listed === '') return [];
    throw new Error(`the index lists ${quotedJson(listed)} but the goal has no evidence section`);
  }
  const items = goal
    .slice(at + EVIDENCE_MARKER.length, end)
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map(readEvidenceLine);
  const read = items.map((item) => item.alias).join(' ');
  if (listed !== read) {
    throw new Error(
      `the evidence lines read ${quotedJson(read)} where the index lists ${quotedJson(listed)}`,
    );
  }
  return items;
}
