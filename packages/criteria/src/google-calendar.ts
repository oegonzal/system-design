import type { Criterion } from './criterion';

/** The calendar service (packages/google-calendar). */
export const GOOGLE_CALENDAR_CRITERIA: readonly Criterion[] = [
  {
    id: 'GCL-1',
    statement:
      'The calendar service says what it saw and did on the bus under its own source — an event created, changed or cancelled, an invitation waiting for an answer — through topics declared once in the contracts with strict payloads.',
  },
];
