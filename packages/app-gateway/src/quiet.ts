import type { LoopActivity } from './idle';
import type { Log } from './log';
import type { ServiceControl } from './wake';

/**
 * The deploy's question: is anything in flight that a roll of the app task
 * would end? A deploy registers a new task definition, and the service — one
 * task at a time, minimum healthy 0 — stops the running task before the new
 * one is up, and with it every grade the loop was running (the janitor fails
 * it as stale minutes later) and every browser session whose steps run
 * through it. Seen 2026-11-16: a grade submitted at 03:00Z died when the
 * pipeline rolled the task at 03:13Z, and a nightly session would die the
 * same way. `aws.sh wait-quiet` asks this before a migration or an app
 * deploy and waits while the answer is busy.
 *
 * The two counts are the idle check's, taken without its side effects: the
 * cluster's tasks that are not the service's own are counted and never
 * stopped, and the loop is asked for runs in progress only when the service
 * wants a task (asleep, nothing runs on it). A count that could not be taken
 * is answered as not quiet with what is unknown named, for the caller to
 * wait a little and then go on — a wrong wait costs minutes, a wrong roll
 * costs a run.
 */
export interface JobCounter {
  /** How many tasks in the cluster are not the service's own, or none when ECS could not say. */
  runningJobs(): Promise<number | undefined>;
}

export interface QuietSummary {
  quiet: boolean;
  desiredCount?: number;
  runningJobs?: number;
  runningRuns?: number;
  /** The count the answer rests on that could not be taken, when one could not. */
  unknown?: 'jobs' | 'service' | 'loop';
}

interface QuietDeps {
  service: ServiceControl;
  jobs: JobCounter;
  loop: LoopActivity;
  log: Log;
}

export type QuietHandler = () => Promise<QuietSummary>;

export function createQuietHandler({ service, jobs, loop, log }: QuietDeps): QuietHandler {
  const report = (summary: QuietSummary): QuietSummary => {
    log('quiet check', { ...summary });
    return summary;
  };
  const check = async (): Promise<QuietSummary> => {
    const runningJobs = await jobs.runningJobs();
    if (runningJobs === undefined) return report({ quiet: false, unknown: 'jobs' });
    if (runningJobs > 0) return report({ quiet: false, runningJobs });
    const desiredCount = await service.desiredCount();
    if (desiredCount === undefined) {
      return report({ quiet: false, unknown: 'service', runningJobs });
    }
    if (desiredCount === 0) {
      return report({ quiet: true, desiredCount, runningJobs, runningRuns: 0 });
    }
    const runningRuns = await loop.runningRuns();
    if (runningRuns === undefined) {
      return report({ quiet: false, unknown: 'loop', desiredCount, runningJobs });
    }
    return report({ quiet: runningRuns === 0, desiredCount, runningJobs, runningRuns });
  };

  /** A failed check is logged and left failed: the caller reads a failed invocation as unknown. */
  return async () => {
    try {
      return await check();
    } catch (error) {
      log('quiet check failed', { error: String(error) });
      throw error;
    }
  };
}
