/**
 * The goal codec of the `document-digest` pipeline. A document chunk — a
 * résumé page, a notes file, the operator's answers in one unit of work — is
 * rendered by the program that owns the document (the ingester, the browser
 * session) as the goal every stage reads: numbered sections the model cites
 * by alias, the rules, and the index the validators read back.
 */
import { z } from 'zod';

import { unitKeySchema } from '../units/identity';
import { MEMORY_SCOPES, type MemoryScope } from '../units/scope';
import {
  readFencedIndex,
  renderIndexSection,
  SECTION_ALIAS,
  sectionAlias,
  withinBudget,
} from './goal-index';

export const DOCUMENT_DIGEST_ID = 'document-digest';

/** `resume` and `notes` are the user's documents; `guidance` is what the operator answered at a form. */
export const DOCUMENT_KINDS = ['resume', 'notes', 'guidance'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Caps chosen so a maximal chunk renders well under the engine's goal budget. */
export const DOCUMENT_PART_MAX_LENGTH = 1500;
export const DOCUMENT_MAX_PARTS = 32;
export const DOCUMENT_MAX_MEMORIES = 16;
export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const DOCUMENT_SUBJECT_MAX_LENGTH = 120;
export const DOCUMENT_CONTEXT_MAX_LENGTH = 300;
const RULE_MAX_LENGTH = 300;
const MAX_RULES = 8;

/**
 * What a document memory is, so recall can ask for the shape a field needs
 * rather than reading one flat register. A short input field wants a fact; an
 * essay field wants the narrative a fact cannot carry; and a boundary on what
 * the subject may claim is not an answer at all — retrieved as one it would
 * fill a field with its own disclaimer, and left out it cannot stop an
 * overstatement. These are a subset of the store's own chunk kinds, pinned by a
 * spec, so a probe narrowing by kind reaches them. They are named apart from
 * the knowledge kinds rather than merged with them: a writer owns a source
 * run's points by kind, so two writers sharing one kind under one run would
 * each erase the other's — and a probe for what is true of this person must
 * not return an agent's engineering knowledge, which a shared `fact` would
 * have conflated.
 */
export const DOCUMENT_MEMORY_KINDS = ['profile_fact', 'profile_story', 'claim_boundary'] as const;
export type DocumentMemoryKind = (typeof DOCUMENT_MEMORY_KINDS)[number];

/** What each kind is for, rendered into the goal so the producer chooses by it. */
export const DOCUMENT_MEMORY_KIND_USES: Readonly<Record<DocumentMemoryKind, string>> = {
  profile_fact: 'one thing true of the subject that a field could take or compute from',
  profile_story:
    'a course of events the subject was part of, kept whole, for a field asking them to describe or recount one',
  claim_boundary:
    'a bound on what the subject may claim, for a field a careless answer would overstate',
};

/**
 * The kinds as a form goal's legend lists them — each with its use, in the
 * order declared — for whoever composes a goal over document memories.
 */
export const DOCUMENT_MEMORY_LEGEND: readonly { kind: DocumentMemoryKind; use: string }[] =
  DOCUMENT_MEMORY_KINDS.map((kind) => ({ kind, use: DOCUMENT_MEMORY_KIND_USES[kind] }));

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const documentHeadShape = {
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
  /** Whom the facts are about, by name — so every stored fact is self-contained. */
  subject: z.string().min(1).max(DOCUMENT_SUBJECT_MAX_LENGTH),
  /** The day the document speaks for; null when nothing says. */
  date: z.string().regex(DAY).nullable(),
  /**
   * Where every memory of the document holds (`MemoryScope`, the units
   * domain's vocabulary), when the document declares it:
   * the goal tells every lens so in place of the scope test, and the store
   * keeps each memory under it whatever its digest wrote. Absent when the
   * document declares none, and each memory is then scoped by the scope test
   * (`SCOPE_RULE`). Absent rather than null, because the goal of a document
   * that declares nothing must render as it did before a document could
   * declare one: the ingester names a chunk by its goal's hash.
   */
  scope: z.enum(MEMORY_SCOPES).optional(),
  /**
   * The unit of work the document's memories bound to one were recorded for,
   * as its composer names it (`unitKeyOf`): an operator's answers given in one
   * unit. Written to the index only — never to the head line, the rules or
   * the limits, so no lens is told of it — and stamped by the document reader
   * on each such memory. Absent when the document names none, as no document
   * the ingester renders does, so its goal renders as before a document could.
   */
  unitKey: unitKeySchema.optional(),
  chunk: z.strictObject({ index: z.number().int().min(1), of: z.number().int().min(1) }),
};

export const documentChunkSchema = z.strictObject({
  ...documentHeadShape,
  /** The enclosing headings, for continuity between chunks; never repeated text. */
  context: z.string().max(DOCUMENT_CONTEXT_MAX_LENGTH).nullable(),
  parts: z.array(z.string().min(1).max(DOCUMENT_PART_MAX_LENGTH)).min(1).max(DOCUMENT_MAX_PARTS),
  rules: z.array(z.string().min(1).max(RULE_MAX_LENGTH)).max(MAX_RULES),
  maxMemories: z.number().int().min(1).max(DOCUMENT_MAX_MEMORIES),
});
export type DocumentChunk = z.infer<typeof documentChunkSchema>;

/**
 * The scope test, as the rule that decides each memory's scope when the
 * document declares none. A document that declares its scope has decided it
 * for every memory, so its goal leaves this rule out of the rules it states —
 * chosen by this constant, never by the rule's wording.
 */
export const SCOPE_RULE =
  'A memory is scoped by one test — would the answer differ for another employer, role or application? Unit where it would: working or knowing someone there, consents, how it was heard of, whether this posting suits. Subject where it is the same whoever asks, however the form asked it for one role.';

/**
 * Rules a composer can state as they are; they guide the producer and the
 * critics. The scope test among them (`SCOPE_RULE`) is stated only where the
 * document declares no scope.
 */
export const DOCUMENT_RULES: readonly string[] = [
  'A memory states one fact the cited sections state about the subject, and nothing they do not.',
  'An insight is a complete statement a form field could take or compute from: absolute dates and figures, names as the document spells them, the subject named.',
  'An appliesWhen names the situation a form puts the subject in — the field or question that calls for the fact.',
  "Where a cited section qualifies a claim — reported rather than audited, a design, a learning exercise or a planned project, an interpretation — the insight carries that qualifier in the section's own words; a section that states a fact plainly needs none.",
  SCOPE_RULE,
  "Where cited sections date a role, or the roles a technology was used in, the insight states both ends as given and the span between them in whole years and months, computed from those dates alone; an open end is computed to the document's date, and the insight says so.",
];

export const documentIndexSchema = z.strictObject({
  pipeline: z.literal(DOCUMENT_DIGEST_ID),
  maxMemories: z.number().int().min(1),
  document: z.strictObject(documentHeadShape),
  evidence: z.array(
    z.strictObject({
      alias: z.string().regex(SECTION_ALIAS),
      kind: z.literal('section'),
      ref: z.string().min(1),
    }),
  ),
});
export type DocumentIndex = z.infer<typeof documentIndexSchema>;

const indexOf = (chunk: DocumentChunk): DocumentIndex => ({
  pipeline: DOCUMENT_DIGEST_ID,
  maxMemories: chunk.maxMemories,
  document: {
    kind: chunk.kind,
    title: chunk.title,
    subject: chunk.subject,
    date: chunk.date,
    ...(chunk.scope === undefined ? {} : { scope: chunk.scope }),
    ...(chunk.unitKey === undefined ? {} : { unitKey: chunk.unitKey }),
    chunk: chunk.chunk,
  },
  evidence: chunk.parts.map((_, position) => ({
    alias: sectionAlias(position),
    kind: 'section' as const,
    ref: sectionAlias(position),
  })),
});

const headLine = (chunk: DocumentChunk): string =>
  [
    `Kind: ${chunk.kind}`,
    `Subject: ${chunk.subject}`,
    chunk.date === null ? 'Undated' : `Dated: ${chunk.date}`,
    `Chunk ${chunk.chunk.index} of ${chunk.chunk.of}`,
    ...(chunk.context === null || chunk.context === '' ? [] : [`Under: ${chunk.context}`]),
  ].join(' · ');

/**
 * The limit a document that declares its scope renders in place of the scope
 * test, where every lens reads it: the producer is told the scope to write,
 * and every judge that the scope is the document's declaration, not theirs to
 * fault. Its goal leaves the scope test out of the rules it states
 * (`rulesOf`), so the deriver is given no scope rule to write a criterion
 * from; and whatever a judge still says of a memory's scope, the store keeps
 * every memory under the declaration. Rendered only when declared.
 */
export const declaredScopeLimit = (scope: MemoryScope): string =>
  `- Give every memory the scope ${scope}: the document declares it for everything it states, so the scope test does not apply and no memory is faulted for its scope.`;

/** The rules a goal states: the chunk's own, less the scope test where the document declares its scope. */
const rulesOf = (chunk: DocumentChunk): readonly string[] =>
  chunk.scope === undefined ? chunk.rules : chunk.rules.filter((rule) => rule !== SCOPE_RULE);

/**
 * The line closing the Limits: what holds the digest to them, and that none of
 * them is a criterion. No validator checks a declared scope — the store keeps
 * every memory under it — so a declared goal names the store.
 */
const limitsClosing = (chunk: DocumentChunk): string =>
  chunk.scope === undefined
    ? '- Validators check these limits; they are not criteria.'
    : '- The store keeps every memory under the declared scope, and validators check the other limits; they are not criteria.';

/** The goal, or a refusal when it would not fit the engine's budget. */
export function renderDocumentGoal(chunk: DocumentChunk): string {
  const rules = rulesOf(chunk);
  const goal = [
    `# Document — ${chunk.title.trim()}`,
    '',
    headLine(chunk),
    '',
    '## Sections',
    '',
    ...chunk.parts.flatMap((part, position) => [
      `### [${sectionAlias(position)}]`,
      '',
      part.trim(),
      '',
    ]),
    '## Rules',
    '',
    ...(rules.length > 0 ? rules.map((rule) => `- ${rule}`) : ['(none)']),
    '',
    '## Limits',
    '',
    `- Propose at most ${chunk.maxMemories} memories, each resting on one to four of the listed sections.`,
    `- Give each memory a kind: ${DOCUMENT_MEMORY_LEGEND.map(({ kind, use }) => `${kind} — ${use}`).join('; ')}.`,
    ...(chunk.scope === undefined ? [] : [declaredScopeLimit(chunk.scope)]),
    '- A section may support several memories; list every section no memory rests on under unused.',
    limitsClosing(chunk),
    '',
    renderIndexSection(indexOf(chunk)),
  ].join('\n');
  return withinBudget(goal);
}

/** The index this codec wrote, or null for a goal that is not a document chunk. */
export const readDocumentIndex = (goal: string): DocumentIndex | null =>
  readFencedIndex(goal, documentIndexSchema);
