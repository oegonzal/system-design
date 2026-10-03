/**
 * The goal codec of the `document-digest` pipeline. A document chunk — a
 * résumé page, a notes file, the operator's answers from one session — is
 * rendered by the program that owns the document (the ingester, the browser
 * session) as the goal every stage reads: numbered sections the model cites
 * by alias, the rules, and the index the validators read back.
 */
import { z } from 'zod';

import { readFencedIndex, renderFencedIndex, withinBudget } from './goal-index';

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
  'An appliesWhen names the situation a form puts the applicant in — the field or question that calls for the fact.',
  "Where a cited section qualifies a claim — reported rather than audited, a design, a learning exercise or a planned project, an interpretation — the insight carries that qualifier in the section's own words; a section that states a fact plainly needs none.",
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
    '- A section may support several memories; list every section no memory rests on under unused.',
    '- Validators check these limits; they are not criteria.',
    '',
    '## Index',
    '',
    renderFencedIndex(indexOf(chunk)),
  ].join('\n');
  return withinBudget(goal);
}

/** The index this codec wrote, or null for a goal that is not a document chunk. */
export const readDocumentIndex = (goal: string): DocumentIndex | null =>
  readFencedIndex(goal, documentIndexSchema);
