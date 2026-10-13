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
  DOCUMENT_MAX_PARTS,
  DOCUMENT_RULES,
  type DocumentChunk,
} from '../quality-loop/document-digest';
import { quoted } from '../text';
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

/**
 * One session's answers as one document chunk. The caller splits past the
 * part cap; the title names the session so the stored facts say where they
 * were learned.
 */
export function guidanceDocument(
  sessionId: Uuid,
  subject: string,
  items: readonly OperatorGuidanceDto[],
  date: string | null,
): DocumentChunk {
  const parts = items.slice(0, DOCUMENT_MAX_PARTS).map(renderGuidanceSection);
  return {
    kind: 'guidance',
    title: `Operator guidance — session ${sessionId}`,
    subject,
    date,
    chunk: { index: 1, of: 1 },
    context: null,
    parts,
    rules: [...DOCUMENT_RULES, GUIDANCE_RULE],
    maxMemories: Math.max(1, Math.min(parts.length, DOCUMENT_MAX_MEMORIES)),
  };
}
