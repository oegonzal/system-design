import { z } from 'zod';

import type { Log } from './log';
import { ensureDesired, type ServiceControl } from './wake';

/**
 * The job path: one launch of the browser session as one task. A schedule
 * and an operator both come through here, so the task's command is derived
 * in exactly one place — the declared template with the launch's name in
 * it, plus whatever arguments a manual run adds. The session reaches the
 * loop and the lanes on the app task's private name, never through the
 * gateway, so the handler first tells the app service to want a task when
 * it wants none, then starts the job's own task. Every failure is thrown:
 * an invocation that started nothing must fail where the schedule's error
 * count and the operator's terminal can see it.
 *
 * One launch runs one task at a time. A schedule invokes the function
 * asynchronously, and Lambda's queue can deliver an event twice or retry a
 * failed invocation minutes later; an operator can start a launch while the
 * schedule's task is coming up. The engine's own lease (one session per
 * profile) does not catch a second task, because the row it reads is
 * written only after the profile is restored and the loop is awaited —
 * minutes in — so the handler asks ECS for a running task of the launch
 * before it touches anything, and refuses while one exists.
 */
export interface TaskRunner {
  /** The ARNs of the tasks tagged `startedBy` that ECS wants running — provisioning and pending ones too — every page read. */
  running(startedBy: string): Promise<readonly string[]>;
  /** Starts one task running `command`, tagged `startedBy`: the task's ARN, or a throw naming why none started. */
  run(request: { command: readonly string[]; startedBy: string }): Promise<string>;
}

/** What the launch's name takes the place of, wherever a word of the command template carries it. */
export const LAUNCH_PLACEHOLDER = '{launch}';

/**
 * ECS allows letters, digits, `-`, `/` and `_` in `startedBy` — no colon —
 * so a job's task is tagged `job/<launch>`; `aws.sh session list` prints it.
 */
const startedBy = (launch: string): string => `job/${launch}`;

/** One printable word: ASCII from `!` to `~`, so no space and nothing a terminal could not show. */
const PRINTABLE_WORD = /^[!-~]+$/;

/** `{launch, args?}`: the launch by name and up to 32 arguments, each one printable word. */
const JOB_EVENT = z.strictObject({
  launch: z.string().min(1),
  args: z
    .array(z.string().regex(PRINTABLE_WORD, 'an argument is one printable word without spaces'))
    .max(32)
    .optional(),
});

export class JobRefused extends Error {
  override readonly name = 'JobRefused';
}

export interface JobStarted {
  launch: string;
  taskArn: string;
}

interface JobDeps {
  service: ServiceControl;
  tasks: TaskRunner;
  /** The launches the handler may start, by name. */
  launches: readonly string[];
  /** The command template, `LAUNCH_PLACEHOLDER` where the launch's name goes. */
  command: readonly string[];
  log: Log;
}

export type JobHandler = (event: unknown) => Promise<JobStarted>;

const refuse = (message: string): never => {
  throw new JobRefused(message);
};

export function createJobHandler({ service, tasks, launches, command, log }: JobDeps): JobHandler {
  const start = async (event: unknown): Promise<JobStarted> => {
    const parsed = JOB_EVENT.safeParse(event);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'event'}: ${issue.message}`,
      );
      return refuse(`a job event is {launch, args?}: ${issues.join('; ')}`);
    }
    const { launch, args = [] } = parsed.data;
    if (!launches.includes(launch)) {
      return refuse(`unknown launch "${launch}"; the launches are ${launches.join(', ')}`);
    }
    const tag = startedBy(launch);
    const running = await tasks.running(tag);
    if (running.length > 0) {
      return refuse(
        `the ${launch} launch already runs as ${running.join(', ')}; a second task on its profile is refused (aws.sh session stop <task-id> ends the first)`,
      );
    }
    const woken = await ensureDesired(service, 1);
    if (woken.outcome === 'not-found') {
      return refuse('the app service was not found; the launch would have nothing to reach');
    }
    log(
      woken.outcome === 'asked'
        ? 'waking the service for the job'
        : 'the service is up for the job',
      {
        launch,
        desiredCount: woken.desiredCount,
      },
    );
    const taskArn = await tasks.run({
      command: [...command.map((word) => word.replaceAll(LAUNCH_PLACEHOLDER, launch)), ...args],
      startedBy: tag,
    });
    log('job started', { launch, args, taskArn });
    return { launch, taskArn };
  };

  /** A launch that did not start is logged and left failed: the schedule's error count, and the operator, read it. */
  return async (event) => {
    try {
      return await start(event);
    } catch (error) {
      log('job failed', { error: String(error) });
      throw error;
    }
  };
}
