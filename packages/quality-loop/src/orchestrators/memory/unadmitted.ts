/**
 * What a memory step says when the child it read endorsed nothing: the
 * engine's `admission`, in the orchestrator's closed vocabulary. One table,
 * so the recall step, the digest step and a run's own recall can never give
 * the same admission a different name — and "nothing was judged" is never
 * collapsed into "judged and fell short".
 */
import type { Admission, MemoryStepReason } from '@sysdesign/contracts';

export type Unadmitted = Exclude<Admission, 'admitted'>;

export const UNADMITTED_REASON = {
  'fell-short': 'not-accepted',
  'no-rubric': 'no-rubric',
  'no-artifact': 'no-artifact',
} as const satisfies Record<Unadmitted, MemoryStepReason>;

export type UnadmittedReason = (typeof UNADMITTED_REASON)[Unadmitted];
