/**
 * The goal codec of the `register-digest` pipeline. A text — a conversation,
 * a passage, a tool's result — is handed to a memory space by the program that
 * owns it, already split into parts it labels and dates, and the space's host
 * renders it as the goal every stage reads: each part quoted under the alias
 * of its position; the registers a memory may be filed under, with what each
 * holds, the fields it reconciles on and the identities it keeps reserved; the
 * owner's rules and the limits; and last, the index the validators and the
 * host read back. The space, the scope every memory is written under and where
 * the text came from are the host's to stamp on each write, so they are
 * written into the index alone: no model is shown them, and none can write
 * them. Every line of a part is quoted and every other value is written on a
 * line of the codec's own, so nothing a part carries can open a section.
 */
import { z } from 'zod';

import { keptAtMost } from '../bounds';
import {
  readFencedIndex,
  renderIndexSection,
  SECTION_ALIAS,
  sectionAlias,
  withinBudget,
} from '../quality-loop/goal-index';
import { quoted, quotedJson } from '../text';
import { MEMORY_FIELD_NAME } from './executability';
import {
  instantSchema,
  provenanceSchema,
  recordScopeSchema,
  type WritableRegisterDto,
} from './memory';
import {
  MEMORY_TERMS,
  REGISTER_HOLDS_BOUND,
  REGISTER_KINDS,
  REGISTER_NAME_BOUND,
  STRATEGY_REGISTERS_BOUND,
} from './strategy';

export const REGISTER_DIGEST_ID = 'register-digest';

/**
 * The iterations one digest may take: the pipeline's loop policy reads it and
 * the host sends it with every start, so the orchestration record states the
 * budget its child runs under.
 */
export const REGISTER_DIGEST_MAX_ITERATIONS = 2;

/**
 * Caps chosen so a maximal text in ASCII — every part at its length on about
 * twenty lines — renders under the engine's goal budget beside every register
 * a space keeps. A goal past the budget is refused, never clipped.
 */
export const REGISTER_DIGEST_MAX_PARTS = 16;
export const REGISTER_DIGEST_PART_MAX_LENGTH = 1500;
export const REGISTER_DIGEST_LABEL_MAX_LENGTH = 80;
export const REGISTER_DIGEST_TITLE_MAX_LENGTH = 200;
export const REGISTER_DIGEST_MAX_RULES = 8;
export const REGISTER_DIGEST_RULE_MAX_LENGTH = 300;

/**
 * The most memories one digest proposes, and the most sections one memory
 * rests on: the limits state them, and the pipeline asks the model for no more.
 */
export const REGISTER_DIGEST_MAX_MEMORIES = 24;
export const REGISTER_DIGEST_MAX_EVIDENCE = 4;

/** A register named as its strategy declares it, as long as a lenient read of a strategy keeps a name. */
const registerName = z.string().min(1).max(keptAtMost(REGISTER_NAME_BOUND));
const fieldName = z.string().regex(MEMORY_FIELD_NAME);

/** One part of the text, as its owner hands it in. */
const partSchema = z.strictObject({
  /** Who or what the part is — a speaker, a tool, a heading — as the owner names it; null when it names none. */
  label: z.string().trim().min(1).max(REGISTER_DIGEST_LABEL_MAX_LENGTH).nullable(),
  /** When the part was said or written; null when the owner does not know. */
  at: instantSchema.nullable(),
  text: z.string().trim().min(1).max(REGISTER_DIGEST_PART_MAX_LENGTH),
});

/**
 * A digest as its caller asks for one: the text already split into parts, the
 * rules the caller adds, the registers it narrows the digest to — null for
 * every register the space lets a writer remember into — and the scope and
 * provenance every memory it keeps is written under.
 */
export const registerDigestRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(REGISTER_DIGEST_TITLE_MAX_LENGTH),
  parts: z.array(partSchema).min(1).max(REGISTER_DIGEST_MAX_PARTS),
  rules: z
    .array(z.string().trim().min(1).max(REGISTER_DIGEST_RULE_MAX_LENGTH))
    .max(REGISTER_DIGEST_MAX_RULES)
    .default([]),
  registers: z
    .array(registerName)
    .min(1)
    .max(STRATEGY_REGISTERS_BOUND.ceiling)
    .nullable()
    .default(null),
  scope: recordScopeSchema,
  provenance: provenanceSchema,
});
export type RegisterDigestRequest = z.infer<typeof registerDigestRequestSchema>;

/**
 * A register the goal lists, as the runtime's write brief answers it: what its
 * strategy declares — its name and what it holds — held to what a lenient read
 * of a strategy keeps, and how its kind files a memory as the runtime declares it.
 */
const writableRegisterSchema = z.strictObject({
  name: registerName,
  kind: z.enum(REGISTER_KINDS),
  term: z.enum(MEMORY_TERMS),
  holds: z.string().max(keptAtMost(REGISTER_HOLDS_BOUND)),
  identity: z.array(fieldName),
  reserved: z.array(z.strictObject({ field: fieldName, value: z.string().min(1) })),
}) satisfies z.ZodType<WritableRegisterDto>;

/** What a goal is rendered from: the request less its narrowing, the space, and the registers the narrowing left. */
export const registerDigestInputSchema = registerDigestRequestSchema
  .omit({ registers: true })
  .extend({
    spaceId: z.uuid(),
    registers: z.array(writableRegisterSchema).min(1).max(STRATEGY_REGISTERS_BOUND.ceiling),
  });
export type RegisterDigestInput = z.infer<typeof registerDigestInputSchema>;

/**
 * The index: the space, scope and provenance the host writes every endorsed
 * memory under, the sections a memory may rest on, and each register a memory
 * may be filed under with its kind and the identities it keeps reserved.
 */
const registerDigestIndexSchema = registerDigestInputSchema
  .pick({ spaceId: true, scope: true, provenance: true })
  .extend({
    pipeline: z.literal(REGISTER_DIGEST_ID),
    sections: z.array(z.string().regex(SECTION_ALIAS)).min(1),
    registers: z
      .array(writableRegisterSchema.pick({ name: true, kind: true, reserved: true }))
      .min(1),
  });
export type RegisterDigestIndex = z.infer<typeof registerDigestIndexSchema>;

type Part = RegisterDigestInput['parts'][number];
type Register = RegisterDigestInput['registers'][number];

/** A value on a line of the codec's own: its line breaks and runs of space collapsed. */
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Every line break JavaScript reads as one: a part's line ends at each, so each starts a quoted line. */
const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/;

const quotedLines = (text: string): string[] =>
  text
    .trim()
    .split(LINE_BREAK)
    .map((line) => `> ${line}`);

/** A heading, a blank line, then each block and a blank line after it: the shape every section of the goal has. */
const section = (heading: string, blocks: readonly (readonly string[])[]): string[] => [
  heading,
  '',
  ...blocks.flatMap((block) => [...block, '']),
];

/** A part's heading: its alias, then the label and the time its owner declared. */
const sectionHeading = (part: Part, position: number): string => {
  const label = part.label === null ? '' : ` ${quoted(part.label)}`;
  const time = part.at === null ? 'undated' : oneLine(part.at);
  return `### [${sectionAlias(position)}]${label} · ${time}`;
};

const partBlock = (part: Part, position: number): string[] => [
  sectionHeading(part, position),
  '',
  ...quotedLines(part.text),
];

const reconcilesLine = (identity: readonly string[]): string =>
  identity.length === 0
    ? 'Reconciles on: nothing — each memory is kept as its own record.'
    : `Reconciles on: ${identity.map(oneLine).join(', ')} — a memory with the same values supersedes the current one.`;

const reservedLine = (reserved: Register['reserved']): string => {
  const identities = reserved.map(({ field, value }) => `${oneLine(field)} = ${quotedJson(value)}`);
  return `Reserved: ${identities.join(', ')} — values consolidation writes; no memory takes them.`;
};

/** A register under its name, exactly as a memory names it, with its kind and term, what it holds and how it files. */
const registerBlock = (register: Register): string[] => {
  const holds = oneLine(register.holds);
  return [
    `### ${quotedJson(register.name)} — ${register.kind}, ${register.term}`,
    '',
    `Holds: ${holds === '' ? '(not stated)' : holds}`,
    reconcilesLine(register.identity),
    ...(register.reserved.length === 0 ? [] : [reservedLine(register.reserved)]),
  ];
};

const LIMITS: readonly string[] = [
  `- Propose at most ${REGISTER_DIGEST_MAX_MEMORIES} memories, each filed under one listed register as one candidate of its kind and resting on 1 to ${REGISTER_DIGEST_MAX_EVIDENCE} listed sections; a section may back several memories.`,
  '- Validators check these limits and every reserved identity; they are not criteria.',
];

const indexOf = (input: RegisterDigestInput): RegisterDigestIndex => ({
  pipeline: REGISTER_DIGEST_ID,
  spaceId: input.spaceId,
  scope: input.scope,
  provenance: input.provenance,
  sections: input.parts.map((_, position) => sectionAlias(position)),
  registers: input.registers.map(({ name, kind, reserved }) => ({ name, kind, reserved })),
});

/** The goal, or a refusal when it would not fit the engine's budget. */
export function renderRegisterDigestGoal(input: RegisterDigestInput): string {
  const rules = input.rules.map((rule) => `- ${oneLine(rule)}`);
  const goal = [
    `# Text — ${oneLine(input.title)}`,
    '',
    ...section('## Sections', input.parts.map(partBlock)),
    ...section('## Registers', input.registers.map(registerBlock)),
    ...section('## Rules', [rules.length > 0 ? rules : ['(none)']]),
    ...section('## Limits', [LIMITS]),
    renderIndexSection(indexOf(input)),
  ].join('\n');
  return withinBudget(goal);
}

/** The index this codec wrote, or null for a goal it did not write. */
export const readRegisterDigestIndex = (goal: string): RegisterDigestIndex | null =>
  readFencedIndex(goal, registerDigestIndexSchema);
