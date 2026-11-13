import { createJobHandler, JobRefused, type TaskRunner } from './job';
import { recordedLog } from './testing';
import type { ServiceControl } from './wake';

/** The command template as apps.json declares it, and the launches it names. */
const COMMAND = ['run', '--launch', '{launch}', '--headless', '--wait-for-loop', '8'];
const LAUNCHES = ['linkedin', 'builtin'];

const taskArn = (n: number) => `arn:aws:ecs:us-east-1:123456789012:task/cluster/${n}`;

/**
 * A job handler over fakes: a service at a desired count (`undefined` is not
 * found; `failing` cannot be asked), and a task runner that answers the
 * lookup from `running` (none unless said; `lookupFailing` cannot be asked)
 * and records what it was asked to run, or the one handed in.
 */
function job(
  desired: number | undefined,
  options: {
    failing?: boolean;
    run?: TaskRunner['run'];
    running?: readonly string[];
    lookupFailing?: boolean;
  } = {},
) {
  const set: number[] = [];
  const runs: { command: readonly string[]; startedBy: string }[] = [];
  const looked: string[] = [];
  const service: ServiceControl = {
    desiredCount: async () => {
      if (options.failing) throw new Error('ecs down');
      return desired;
    },
    setDesiredCount: async (count) => void set.push(count),
  };
  const tasks: TaskRunner = {
    running: async (startedBy) => {
      looked.push(startedBy);
      if (options.lookupFailing) throw new Error('list-tasks throttled');
      return options.running ?? [];
    },
    run:
      options.run ??
      (async (request) => {
        runs.push(request);
        return taskArn(runs.length);
      }),
  };
  const { log, lines } = recordedLog();
  const handler = createJobHandler({ service, tasks, launches: LAUNCHES, command: COMMAND, log });
  return { handler, set, runs, looked, lines };
}

describe('the job handler', () => {
  it('[OPS-1] tells a sleeping service to want one task, then runs the launch as one task of its own with the command the template derives', async () => {
    const asleep = job(0);
    await expect(asleep.handler({ launch: 'linkedin' })).resolves.toEqual({
      launch: 'linkedin',
      taskArn: taskArn(1),
    });
    expect(asleep.set).toEqual([1]);
    expect(asleep.runs).toEqual([
      {
        command: ['run', '--launch', 'linkedin', '--headless', '--wait-for-loop', '8'],
        startedBy: 'job/linkedin',
      },
    ]);
    expect(asleep.lines).toEqual([
      {
        message: 'waking the service for the job',
        detail: { launch: 'linkedin', desiredCount: 1 },
      },
      { message: 'job started', detail: { launch: 'linkedin', args: [], taskArn: taskArn(1) } },
    ]);
  });

  it('[OPS-1] leaves a service that already wants a task alone, and appends a manual run’s arguments', async () => {
    const awake = job(2);
    await awake.handler({ launch: 'builtin', args: ['--max-tasks', '2'] });
    expect(awake.set).toEqual([]);
    expect(awake.runs).toEqual([
      {
        command: [
          'run',
          '--launch',
          'builtin',
          '--headless',
          '--wait-for-loop',
          '8',
          '--max-tasks',
          '2',
        ],
        startedBy: 'job/builtin',
      },
    ]);
    expect(awake.lines[0]).toEqual({
      message: 'the service is up for the job',
      detail: { launch: 'builtin', desiredCount: 2 },
    });
  });

  it('[OPS-5] looks the launch’s own tag up before anything, and runs when no task of it is running', async () => {
    const run = job(0);
    await run.handler({ launch: 'builtin' });
    expect(run.looked).toEqual(['job/builtin']);
    expect(run.runs).toHaveLength(1);
  });

  it('[OPS-5] refuses a launch that already runs, naming its task, before the service is touched and with nothing run', async () => {
    const running = job(0, { running: [taskArn(7)] });
    await expect(running.handler({ launch: 'linkedin' })).rejects.toThrow(
      new JobRefused(
        `the linkedin launch already runs as ${taskArn(7)}; a second task on its profile is refused (aws.sh session stop <task-id> ends the first)`,
      ),
    );
    expect(running.looked).toEqual(['job/linkedin']);
    expect(running.set).toEqual([]);
    expect(running.runs).toEqual([]);
    expect(running.lines).toEqual([
      {
        message: 'job failed',
        detail: {
          error: `JobRefused: the linkedin launch already runs as ${taskArn(7)}; a second task on its profile is refused (aws.sh session stop <task-id> ends the first)`,
        },
      },
    ]);
  });

  it('[OPS-5] fails the invocation, with nothing run, when the running tasks could not be listed', async () => {
    const unknown = job(0, { lookupFailing: true });
    await expect(unknown.handler({ launch: 'linkedin' })).rejects.toThrow('list-tasks throttled');
    expect(unknown.set).toEqual([]);
    expect(unknown.runs).toEqual([]);
  });

  it('[OPS-2] refuses an unknown launch by name, naming the known ones, before the service is touched', async () => {
    const run = job(0);
    await expect(run.handler({ launch: 'indeed' })).rejects.toThrow(
      new JobRefused('unknown launch "indeed"; the launches are linkedin, builtin'),
    );
    expect(run.looked).toEqual([]);
    expect(run.set).toEqual([]);
    expect(run.runs).toEqual([]);
    expect(run.lines).toEqual([
      {
        message: 'job failed',
        detail: {
          error: 'JobRefused: unknown launch "indeed"; the launches are linkedin, builtin',
        },
      },
    ]);
  });

  it.each([
    ['no launch', {}, 'launch: Invalid input: expected string, received undefined'],
    ['no object', 'linkedin', 'event: Invalid input: expected object, received string'],
    [
      'an argument with a space in it',
      { launch: 'linkedin', args: ['--goal', 'two words'] },
      'args.1: an argument is one printable word without spaces',
    ],
    [
      'an empty argument',
      { launch: 'linkedin', args: [''] },
      'args.0: an argument is one printable word without spaces',
    ],
    [
      'more than 32 arguments',
      { launch: 'linkedin', args: Array.from({ length: 33 }, () => 'x') },
      'args: Too big: expected array to have <=32 items',
    ],
    [
      'a key it does not take',
      { launch: 'linkedin', goal: 'x' },
      'event: Unrecognized key: "goal"',
    ],
  ])('[OPS-2] refuses an event with %s, naming the fault', async (_case, event, issue) => {
    const run = job(0);
    await expect(run.handler(event)).rejects.toThrow(
      new JobRefused(`a job event is {launch, args?}: ${issue}`),
    );
    expect(run.looked).toEqual([]);
    expect(run.set).toEqual([]);
  });

  it('[OPS-1] fails the invocation when the service is not found, cannot be asked, or started no task', async () => {
    const missing = job(undefined);
    await expect(missing.handler({ launch: 'linkedin' })).rejects.toThrow(
      new JobRefused('the app service was not found; the launch would have nothing to reach'),
    );
    expect(missing.runs).toEqual([]);

    const unreachable = job(0, { failing: true });
    await expect(unreachable.handler({ launch: 'linkedin' })).rejects.toThrow('ecs down');
    expect(unreachable.runs).toEqual([]);

    const refused = job(0, {
      run: async () => {
        throw new Error('run-task started nothing: RESOURCE:MEMORY');
      },
    });
    await expect(refused.handler({ launch: 'linkedin' })).rejects.toThrow(
      'run-task started nothing: RESOURCE:MEMORY',
    );
    expect(refused.set).toEqual([1]);
    expect(refused.lines.at(-1)).toEqual({
      message: 'job failed',
      detail: { error: 'Error: run-task started nothing: RESOURCE:MEMORY' },
    });
  });
});
