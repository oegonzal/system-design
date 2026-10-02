import type { StopReason } from '@sysdesign/contracts';

/**
 * Why the coach stopped, in the author's terms. Every reason the contract
 * names, so a new one is worded where it is read. The coach panel says it of
 * its run; a revision's feedback and its export say it of the grade that
 * ended one — the API hands a grade its stop reason only when it is news
 * (`gradeStopReason`), never for a plain grade finishing.
 */
export const STOPPED_COPY: Record<StopReason, string> = {
  accepted: 'The coach reached a design the loop accepts.',
  rejected: 'The coach rejected the design outright — its revisions could not lift it.',
  escalated:
    'The coach stopped and escalated — the loop needs a person to judge what its last revision left open.',
  plateau: 'The coach plateaued — its last revisions stopped improving the score.',
  'max-iterations': 'The coach used its iteration budget.',
};
