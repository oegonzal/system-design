import { describeReply } from '@sysdesign/contracts';

import type { InteractionRecord } from './ports';

/** How each withdrawal reads to a person watching the prompt close. */
const WITHDRAWN_AS = {
  'answered-elsewhere': 'Answered elsewhere',
  superseded: 'Replaced by a newer question',
  abandoned: 'No longer needed',
  expired: 'Expired with no answer taken',
} as const;

/** How a prompt ended, in the words every channel shows on the messages it sent: what was answered, or why it closed. */
export function outcomeText(record: InteractionRecord): string {
  const { outcome } = record;
  if (outcome === null) return 'Waiting for an answer';
  if (outcome.kind === 'answered') {
    return `Answered: ${describeReply(record.prompt, outcome.answer.reply)}`;
  }
  const { reason, note } = outcome.withdrawal;
  return note === null ? WITHDRAWN_AS[reason] : `${WITHDRAWN_AS[reason]} — ${note}`;
}
