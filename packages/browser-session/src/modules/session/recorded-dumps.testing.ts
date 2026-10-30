import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TeachReceipt } from '../../core/ports';

/**
 * Session dumps as the specs of `recorded-answers` and `teach-again` write
 * them: a guidance item in the shape a session wrote before question-keyed
 * guidance and in today's, a field's result around one, and a step's
 * teachings in the shape before receipts and in today's. No vitest import.
 */
export const SESSION_A = '11111111-1111-4111-8111-111111111111';
export const AT = '2026-10-10T12:00:00.000Z';
const CONTEXT = { taskLabel: 'Engineer at Acme', page: 'Engineer | Acme' };

/** An item as a session before question-keyed guidance wrote it: the label and the words beside it apart, no chosen basis. */
export const older = (
  label: string,
  question: string | null,
  answer: string,
  options: string[] | null,
) => ({
  sessionId: SESSION_A,
  capturedAt: AT,
  field: { label, question, type: 'radio', options },
  context: CONTEXT,
  answer,
});

/** An item as a session writes it today, given in the unit of work named — null outside any — naming its channel and the scope the answerer declared. */
export const newer = (
  question: string,
  answer: string,
  chosen: string | null,
  unitKey: string | null = null,
) => ({
  sessionId: SESSION_A,
  capturedAt: AT,
  field: { question, type: 'radio', options: ['Yes', 'No'] },
  context: { ...CONTEXT, unitKey },
  answer,
  about: 'subject',
  chosen,
  via: 'chat',
});

/** A field's result as the dump records it: the item, what it was chosen from, and the channel it came on. */
export const withResult = (
  guidance: unknown,
  chosen: string | null = 'option',
  via: string | null = 'chat',
) => ({
  result: { guidance, chosen, via },
});

/** A teaching as a step's teach file recorded it before receipts: the orchestration the loop digested it on, and the document the subject was on. */
export const teaching = (
  decisionId: string,
  orchestrationRunId: string | null,
  subject: string | null = null,
) => ({
  decisionId,
  orchestrationRunId,
  fault: orchestrationRunId === null ? 'loop unreachable' : null,
  document: subject === null ? {} : { subject },
});

/** A teaching as a step's teach file records it today: the reference the memory left, its outcome and the subject at the top. */
export const receipted = (
  decisionId: string,
  ref: string | null,
  outcome: TeachReceipt['outcome'] | null,
  subject = 'Ada Lovelace',
) => ({
  decisionId,
  answer: newer('Will you require sponsorship?', 'No', null),
  subject,
  ref,
  outcome,
  fault: null,
});

/** One step of a dump: its fields file around the results given, and its teach file. */
export async function writeStep(
  dump: string,
  step: string,
  fields: unknown[],
  teachings: unknown[],
): Promise<void> {
  const dir = join(dump, '01-steps', step);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'fields.json'), JSON.stringify({ fields }));
  await writeFile(join(dir, 'teach.json'), JSON.stringify(teachings));
}
