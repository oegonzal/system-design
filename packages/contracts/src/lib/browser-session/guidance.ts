/**
 * What the operator answered at a form, and how it becomes memory: each
 * answer is one section of a `guidance` document, which the session hands to
 * the document-memory orchestrator when the unit of work ends. The session
 * owns the answers, so the session composes the document — another program
 * composing a goal, as every composed-goal pipeline expects.
 */
import { z } from 'zod';

import type { IsoDateString, Uuid } from '../primitives';
import {
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_MAX_PARTS,
  DOCUMENT_RULES,
  type DocumentChunk,
} from '../quality-loop/document-digest';
import { ELEMENT_NAME_MAX, MAX_OPTIONS, OPTION_MAX, TASK_LABEL_MAX } from './observation.schema';
import { FIELD_TYPES } from './vocab';

export const GUIDANCE_QUESTION_MAX_LENGTH = 600;
export const GUIDANCE_ANSWER_MAX_LENGTH = 2000;
export const GUIDANCE_PAGE_MAX_LENGTH = 120;

export const operatorGuidanceSchema = z.strictObject({
  sessionId: z.string().min(1),
  capturedAt: z.string().min(1),
  field: z.strictObject({
    label: z.string().min(1).max(ELEMENT_NAME_MAX),
    /** The text beside the field, when the label alone is terse. */
    question: z.string().max(GUIDANCE_QUESTION_MAX_LENGTH).nullable(),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().max(OPTION_MAX)).max(MAX_OPTIONS).nullable(),
  }),
  context: z.strictObject({
    /** The unit of work, in the mission's terms; never a URL, which would leak into the store. */
    taskLabel: z.string().max(TASK_LABEL_MAX).nullable(),
    page: z.string().max(GUIDANCE_PAGE_MAX_LENGTH).nullable(),
  }),
  answer: z.string().min(1).max(GUIDANCE_ANSWER_MAX_LENGTH),
});
export type OperatorGuidanceDto = z.infer<typeof operatorGuidanceSchema> & {
  sessionId: Uuid;
  capturedAt: IsoDateString;
};

const day = (at: IsoDateString): string => at.slice(0, 10);

/** One answer as a section the digest can cite. */
export function renderGuidanceSection(item: OperatorGuidanceDto): string {
  const where =
    item.context.taskLabel === null ? '' : ` on an application for ${item.context.taskLabel}`;
  const page = item.context.page === null ? '' : ` (${item.context.page})`;
  const question = item.field.question === null ? '' : ` — ${item.field.question}`;
  const options = item.field.options === null ? '' : `, offering ${item.field.options.join(' | ')}`;
  return `Form field "${item.field.label}"${question}${options}${where}${page}, ${day(item.capturedAt)}: the operator answered "${item.answer}".`;
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
    rules: [...DOCUMENT_RULES],
    maxMemories: Math.max(1, Math.min(parts.length, DOCUMENT_MAX_MEMORIES)),
  };
}
