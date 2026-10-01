import type { QualityRunStatus } from '@sysdesign/contracts';
import type { CoachingRun } from '@sysdesign/db';

/**
 * Bring a coaching run's stored status up to what the loop reported: it
 * leaves `running` once, for the terminal status the loop gave, and never
 * goes back — a finished run cannot hold its session again. True when it
 * changed; the caller flushes.
 */
export function recordCoachingStatus(coaching: CoachingRun, observed: QualityRunStatus): boolean {
  if (coaching.status !== 'running' || observed === 'running') return false;
  coaching.status = observed;
  return true;
}
