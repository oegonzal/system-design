import type { Log } from './log';
import type { ServiceControl } from './wake';

/**
 * The sleep path, run on a schedule. The service is stopped only when every
 * sign of use is absent, twice over.
 *
 * Each run reads the proxy's invocations over the idle window. Any means
 * use: the quiet observation on record, if there is one, is cleared and the
 * run is `active`. None, while the service wants a task, is one quiet
 * observation — and one is not enough, because CloudWatch publishes a
 * Lambda metric minutes after the invocation it counts, so a run that reads
 * zero may be reading a window the viewer's last requests have not reached
 * yet. The first quiet observation is written to an SSM parameter the idle
 * handler owns (`quiet-once`); a second one, at least the confirm interval
 * later, asks ECS whether a job's task is running and the loop whether a
 * run is in progress — a session takes hours, a grade takes minutes and the
 * browser only polls — and stops the service only when there is neither. A
 * count that cannot be taken keeps the task: the cost of a wrong stop is a
 * lost run, the cost of a wrong keep is one more interval.
 *
 * A job has a ceiling. ECS never ends a task on its own, and the engine's
 * time limit holds only at a step's or a question's boundary — a hang in
 * the browser's close or the profile's upload is not bounded — so a stuck
 * session would otherwise keep its own task and the app's running for good,
 * with every idle run `busy` and no alarm. The job count stops a task that
 * has existed longer than the ceiling and counts it apart (`stoppedJobs`).
 */
export interface InvocationMetrics {
  /** How many times the proxy ran over the last `windowMinutes`. */
  invocationsSince(windowMinutes: number): Promise<number>;
}

export interface LoopActivity {
  /** How many runs are in progress, or none when the loop could not say. */
  runningRuns(): Promise<number | undefined>;
}

/** The cluster's tasks that are not the service's own: how many run, and how many over the ceiling were stopped instead. */
export interface JobCount {
  running: number;
  stopped: number;
}

export interface JobActivity {
  /** The jobs counted — the ones over the ceiling stopped and counted apart — or none when ECS could not say. */
  count(): Promise<JobCount | undefined>;
}

/**
 * What the state holds when no quiet observation is on record: the value the
 * stack creates the parameter with, and the one `clear` writes back. A clear
 * writes rather than deletes, so the parameter the stack declares is never
 * removed behind CloudFormation's back.
 */
export const NO_OBSERVATION = 'none';

/** The first quiet observation, kept between runs; `read` is what was written, or none. */
export interface IdleState {
  read(): Promise<string | undefined>;
  write(value: string): Promise<void>;
  /** Puts the state back to `NO_OBSERVATION`. */
  clear(): Promise<void>;
}

type IdleOutcome =
  | 'active'
  | 'asleep'
  | 'service-unknown'
  | 'quiet-once'
  | 'busy'
  | 'jobs-unknown'
  | 'loop-unreachable'
  | 'stopped';

export interface IdleSummary {
  outcome: IdleOutcome;
  idleMinutes: number;
  invocations: number;
  desiredCount?: number;
  /** When the first quiet observation was made, as written. */
  quietSince?: string;
  runningJobs?: number;
  /** How many jobs this run stopped for being over the ceiling. */
  stoppedJobs?: number;
  runningRuns?: number;
}

interface IdleDeps {
  metrics: InvocationMetrics;
  service: ServiceControl;
  jobs: JobActivity;
  loop: LoopActivity;
  state: IdleState;
  idleMinutes: number;
  confirmMinutes: number;
  log: Log;
  now?: () => number;
}

export type IdleHandler = () => Promise<IdleSummary>;

/** The observation on record, or none when what was written is not a time (the parameter's initial value is not). */
function observation(written: string | undefined): { since: string; at: number } | undefined {
  if (written === undefined) return undefined;
  const at = Date.parse(written);
  return Number.isNaN(at) ? undefined : { since: written, at };
}

export function createIdleHandler({
  metrics,
  service,
  jobs,
  loop,
  state,
  idleMinutes,
  confirmMinutes,
  log,
  now = Date.now,
}: IdleDeps): IdleHandler {
  const report = (summary: IdleSummary): IdleSummary => {
    log('idle check', { ...summary });
    return summary;
  };
  const check = async (): Promise<IdleSummary> => {
    const invocations = await metrics.invocationsSince(idleMinutes);
    if (invocations > 0) {
      await state.clear();
      return report({ outcome: 'active', idleMinutes, invocations });
    }
    const desiredCount = await service.desiredCount();
    if (desiredCount === undefined) {
      return report({ outcome: 'service-unknown', idleMinutes, invocations });
    }
    if (desiredCount === 0) {
      await state.clear();
      return report({ outcome: 'asleep', idleMinutes, invocations, desiredCount });
    }
    const seen = { idleMinutes, invocations, desiredCount };
    const quiet = observation(await state.read());
    if (quiet === undefined) {
      const quietSince = new Date(now()).toISOString();
      await state.write(quietSince);
      return report({ outcome: 'quiet-once', ...seen, quietSince });
    }
    if (now() - quiet.at < confirmMinutes * 60_000) {
      return report({ outcome: 'quiet-once', ...seen, quietSince: quiet.since });
    }
    // A session task reaches the loop and the lanes on the app task's private
    // name, never through the gateway, so its use is invisible to the
    // invocation metric — and between two of its steps the loop may report no
    // run in progress. The jobs are counted before the loop is asked.
    const counted = await jobs.count();
    if (counted === undefined) {
      return report({ outcome: 'jobs-unknown', ...seen, quietSince: quiet.since });
    }
    const withJobs = {
      ...seen,
      quietSince: quiet.since,
      runningJobs: counted.running,
      stoppedJobs: counted.stopped,
    };
    if (counted.running > 0) return report({ outcome: 'busy', ...withJobs });
    const runningRuns = await loop.runningRuns();
    const confirmed = { ...withJobs, runningRuns };
    if (runningRuns === undefined) return report({ outcome: 'loop-unreachable', ...confirmed });
    if (runningRuns > 0) return report({ outcome: 'busy', ...confirmed });
    await service.setDesiredCount(0);
    await state.clear();
    return report({ outcome: 'stopped', ...confirmed });
  };

  /** A failed check is logged and left failed: the schedule's own error count is what an alarm reads. */
  return async () => {
    try {
      return await check();
    } catch (error) {
      log('idle check failed', { error: String(error) });
      throw error;
    }
  };
}
