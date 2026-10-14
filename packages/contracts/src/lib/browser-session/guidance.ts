/**
 * What the operator answered at a form, and how it becomes memory: each
 * answer is one section of a `guidance` document, which the session hands to
 * the document-memory orchestrator the moment the answer is given. The
 * session owns the answers, so the session composes the document — another
 * program composing a goal, as every composed-goal pipeline expects.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import type { IsoDateString, Uuid } from '../primitives';
import {
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_RULES,
  type DocumentChunk,
} from '../quality-loop/document-digest';
import { quoted } from '../text';
import { unitKeySchema } from '../units/identity';
import { OPTION_BOUND, OPTIONS_BOUND, TASK_LABEL_BOUND } from './observation.schema';
import { FIELD_TYPES, SUGGESTION_BASES } from './vocab';

export const GUIDANCE_QUESTION_MAX_LENGTH = 600;
export const GUIDANCE_ANSWER_MAX_LENGTH = 2000;
export const GUIDANCE_PAGE_MAX_LENGTH = 120;

/**
 * One answer as the session records it. The question is `fieldQuestionOf` the
 * field — the one key the recall's probe will be searched with — so a field
 * that asks nothing it can be told by is never taught; the session parses an
 * item through this schema before it teaches it.
 */
export const operatorGuidanceSchema = z.strictObject({
  sessionId: z.string().min(1),
  capturedAt: z.string().min(1),
  field: z.strictObject({
    /** What the field asks, as the form words it: the label, then the words beside it. */
    question: z.string().min(1).max(GUIDANCE_QUESTION_MAX_LENGTH),
    type: z.enum(FIELD_TYPES),
    options: bounded.list(OPTIONS_BOUND, bounded.text(OPTION_BOUND)).nullable(),
  }),
  context: z.strictObject({
    /** The unit of work, in the mission's terms; never a URL, which would leak into the store. */
    taskLabel: bounded.text(TASK_LABEL_BOUND).nullable(),
    /**
     * The unit of work the answer was given in, as its composer names it
     * (`unitKeyOf`); null outside any. Never rendered into the section: the
     * document its unit's answers make names it on its head.
     */
    unitKey: unitKeySchema.nullable(),
    page: z.string().max(GUIDANCE_PAGE_MAX_LENGTH).nullable(),
  }),
  answer: z.string().min(1).max(GUIDANCE_ANSWER_MAX_LENGTH),
  /** What the operator chose the answer from, when they chose a suggestion; a drafted one is said so the digest keeps it whole. */
  chosen: z.enum(SUGGESTION_BASES).nullable(),
});
export type OperatorGuidanceDto = z.infer<typeof operatorGuidanceSchema> & {
  sessionId: Uuid;
  capturedAt: IsoDateString;
};

const day = (at: IsoDateString): string => at.slice(0, 10);

/**
 * How an answer becomes a memory a later question can rest on: the subject's
 * answer to its question, the question itself as the key, a declared scope,
 * and where it was asked as provenance that never enters the fact. Measured
 * 2026-10-10 and again 2026-10-12: answers stored as one unit of work's
 * events — "for that application, the operator answered…" — were recalled
 * for the same question reworded and refused by the grounding judge as
 * another application's, so the operator was asked again.
 */
export const GUIDANCE_RULE =
  "A section records the subject's answer to one question: the insight is that answer, nothing more; the appliesWhen is the question as quoted; the scope is unit only when the answer would differ for another employer, role or application; where and when it was asked enters neither.";

/** One answer as a section the digest can cite: the question and the answer first, the provenance after. */
export function renderGuidanceSection(item: OperatorGuidanceDto): string {
  const options = item.field.options === null ? '' : `, offering ${item.field.options.join(' | ')}`;
  const drafted =
    item.chosen !== null && item.chosen !== 'record' ? ', choosing a drafted answer' : '';
  const where =
    item.context.taskLabel === null ? '' : ` in the unit of work ${quoted(item.context.taskLabel)}`;
  const page = item.context.page === null ? '' : ` (${item.context.page})`;
  return `Asked ${quoted(item.field.question)}${options}${drafted}, the subject answered ${quoted(item.answer)}. Asked on ${day(item.capturedAt)}${where}${page}.`;
}

/** The items in runs of at most `size`, in order. */
const batches = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

/** One unit's answers — at least one, and no more than one document's memories may hold — as one document chunk. */
const guidanceDocument = (
  sessionId: Uuid,
  subject: string,
  items: readonly OperatorGuidanceDto[],
  unitKey: string | null,
): DocumentChunk => ({
  kind: 'guidance',
  // The session, so the stored facts say where they were learned.
  title: `Operator guidance — session ${sessionId}`,
  subject,
  date: day(items[0].capturedAt),
  ...(unitKey === null ? {} : { unitKey }),
  chunk: { index: 1, of: 1 },
  context: null,
  parts: items.map(renderGuidanceSection),
  rules: [...DOCUMENT_RULES, GUIDANCE_RULE],
  maxMemories: items.length,
});

/**
 * A session's answers as the documents that teach them: one per unit of work
 * they were given in, and one for those given outside any, each split past
 * what one document's memories may hold — in the order the answers were
 * given, each document dated by the day its first answer was. A guidance
 * document is one unit's answers, so its head can name the unit every memory
 * of it bound to one was recorded for. Measured 2026-10-14: 6 of the 12
 * digest runs holding unit-scoped memories mixed two or three units in one
 * document. Generic over what a caller keeps beside each answer, so each
 * document comes back with the answers it holds.
 */
export function guidanceDocuments<T>(
  sessionId: Uuid,
  subject: string,
  answers: readonly T[],
  itemOf: (answer: T) => OperatorGuidanceDto,
): { document: DocumentChunk; answers: T[] }[] {
  const byUnit = new Map<string | null, T[]>();
  for (const answer of answers) {
    const unitKey = itemOf(answer).context.unitKey;
    byUnit.set(unitKey, [...(byUnit.get(unitKey) ?? []), answer]);
  }
  return [...byUnit].flatMap(([unitKey, given]) =>
    batches(given, DOCUMENT_MAX_MEMORIES).map((batch) => ({
      document: guidanceDocument(sessionId, subject, batch.map(itemOf), unitKey),
      answers: batch,
    })),
  );
}
