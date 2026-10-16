import type { Criterion } from './criterion';

/** The mailbox service (packages/gmail). */
export const GMAIL_CRITERIA: readonly Criterion[] = [
  {
    id: 'GML-1',
    statement:
      'The mailbox service says what it saw and did on the bus under its own source — a message newly arrived in the inbox, a draft written, labels changed — through topics declared once in the contracts with strict payloads, and never a message sent: it has no tool that sends.',
  },
];
