/**
 * The goal codec of the `document-digest` pipeline. A document chunk — a
 * résumé page, a notes file, the operator's answers from one session — is
 * rendered by the program that owns the document (the ingester, the browser
 * session) as the goal every stage reads: numbered sections the model cites
 * by alias, the rules, and the index the validators read back.
 */
import { z } from 'zod';

import { readFencedIndex, renderIndexSection, withinBudget } from './goal-index';

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
 * Where a document memory holds: of the subject wherever a form asks, or only
 * of the one employer, role or application it was recorded for. Declared by
 * the digest, carried on the stored chunk and rendered beside the kind, so the
 * form pipelines read it as data and never argue it from the wording of the
 * fact. Measured 2026-10-12: answers taught as one application's events were
 * recalled for the same question reworded, judged another application's, and
 * the operator was asked again — the same fact five times across four
 * sessions.
 */
export const MEMORY_SCOPES = ['subject', 'unit'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** What each scope means, rendered into the digest's schema and the form goals' legend. */
export const MEMORY_SCOPE_USES: Readonly<Record<MemoryScope, string>> = {
  subject:
    'true of the subject wherever asked — the answer is the same whoever asks: their record, their experience, skills, documents, links, status or availability, or their standing answer to a question any form may ask, however the form was asked for one role',
  unit: 'about the one employer, role or application it was recorded for — the answer would differ for another: whether the subject works or worked there, knows anyone there, consents to its messages, how they heard of this opening, whether this posting suits; settles only a question about that same unit of work',
};

/** Every document memory written before scopes were declared was a document's fact about the subject. */
export const DEFAULT_MEMORY_SCOPE: MemoryScope = 'subject';

/** Engine-assigned: the part's position, never anything the model wrote. */
export const sectionAlias = (position: number): string => `section.${position + 1}`;
export const SECTION_ALIAS = /^section\.\d+$/;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const documentHeadShape = {
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
  /** Whom the facts are about, by name — so every stored fact is self-contained. */
  subject: z.string().min(1).max(DOCUMENT_SUBJECT_MAX_LENGTH),
  /** The day the document speaks for; null when nothing says. */
  date: z.string().regex(DAY).nullable(),
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

/** Rules a composer can state as they are; they guide the producer and the critics. */
export const DOCUMENT_RULES: readonly string[] = [
  'A memory states one fact the cited sections state about the subject, and nothing they do not.',
  'An insight is a complete statement a form field could take or compute from: absolute dates and figures, names as the document spells them, the subject named.',
  'An appliesWhen names the situation a form puts the subject in — the field or question that calls for the fact.',
  "Where a cited section qualifies a claim — reported rather than audited, a design, a learning exercise or a planned project, an interpretation — the insight carries that qualifier in the section's own words; a section that states a fact plainly needs none.",
  'A memory is scoped by one test — would the answer differ for another employer, role or application? Unit where it would: working or knowing someone there, consents, how it was heard of, whether this posting suits. Subject where it is the same whoever asks, however the form asked it for one role.',
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

/** The goal, or a refusal when it would not fit the engine's budget. */
export function renderDocumentGoal(chunk: DocumentChunk): string {
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
    ...(chunk.rules.length > 0 ? chunk.rules.map((rule) => `- ${rule}`) : ['(none)']),
    '',
    '## Limits',
    '',
    `- Propose at most ${chunk.maxMemories} memories, each resting on one to four of the listed sections.`,
    `- Give each memory a kind: ${DOCUMENT_MEMORY_KINDS.map((kind) => `${kind} — ${DOCUMENT_MEMORY_KIND_USES[kind]}`).join('; ')}.`,
    '- A section may support several memories; list every section no memory rests on under unused.',
    '- Validators check these limits; they are not criteria.',
    '',
    renderIndexSection(indexOf(chunk)),
  ].join('\n');
  return withinBudget(goal);
}

/** The index this codec wrote, or null for a goal that is not a document chunk. */
export const readDocumentIndex = (goal: string): DocumentIndex | null =>
  readFencedIndex(goal, documentIndexSchema);
