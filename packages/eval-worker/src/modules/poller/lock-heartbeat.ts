import type { EntityManager } from '@mikro-orm/postgresql';
import { EvalJob } from '@sysdesign/db';

import type { PassRecorder } from '../../engine/core/orchestrator';

/** The slice of a logger the heartbeat needs — a failed refresh is worth a line, never a throw. */
export interface HeartbeatLog {
  warn(message: string): void;
}

/**
 * Refresh the running job's lock at every pass boundary.
 *
 * The reaper treats a 'running' job whose `locked_at` is older than the stale
 * window as a crashed worker's and requeues it. A deterministic run finishes
 * in milliseconds, but a live deep eval is five serial model calls that can
 * outlast that window — and with more than one worker the second would claim
 * the job while the first is still grading it, double-running the evaluation.
 * Touching the lock as each pass begins and ends keeps its age bounded by ONE
 * pass, the same way the improver heartbeats between iterations.
 *
 * Fenced by `lockedBy`, as every guarded write in the improver is: a job the
 * reaper already handed to another worker (or that finished) matches nothing,
 * so a late heartbeat can never resurrect a lock it no longer holds. The write
 * is fire-and-forget from the orchestrator's synchronous hook — a heartbeat is
 * best-effort by nature, and it must never cost the evaluation.
 */
export function lockHeartbeat(
  em: EntityManager,
  job: Pick<EvalJob, 'id' | 'lockedBy'>,
  log: HeartbeatLog,
): PassRecorder {
  const touch = (): void => {
    void em
      .fork()
      .nativeUpdate(
        EvalJob,
        { id: job.id, status: 'running', lockedBy: job.lockedBy },
        { lockedAt: new Date() },
      )
      .catch((error: unknown) => {
        log.warn(
          `lock heartbeat for job ${job.id} failed: ${error instanceof Error ? error.message : error}`,
        );
      });
  };
  return { beginPass: touch, endPass: touch };
}
