import { createQuietHandler } from './quiet';
import { recordedLog } from './testing';

/**
 * A quiet handler over fakes: the job count (`unknown` when ECS could not
 * say, `throws` when the adapter itself fails), the service's desired count,
 * the loop's answer (`unknown` when it could not be asked).
 */
function quiet(options: {
  jobs?: number | 'unknown' | 'throws';
  desired?: number | undefined;
  runs?: number | 'unknown';
}) {
  const loopAsked: number[] = [];
  const serviceAsked: number[] = [];
  const { log, lines } = recordedLog();
  const handler = createQuietHandler({
    service: {
      desiredCount: async () => {
        serviceAsked.push(1);
        return options.desired;
      },
      setDesiredCount: async () => {
        throw new Error('the quiet check never sets the desired count');
      },
    },
    jobs: {
      runningJobs: async () => {
        if (options.jobs === 'throws') throw new Error('ecs down');
        return options.jobs === 'unknown' ? undefined : (options.jobs ?? 0);
      },
    },
    loop: {
      runningRuns: async () => {
        loopAsked.push(1);
        return options.runs === 'unknown' ? undefined : (options.runs ?? 0);
      },
    },
    log,
  });
  return { handler, lines, loopAsked, serviceAsked };
}

describe('the quiet check', () => {
  it('[OPS-7] is quiet when no job task runs, the service wants a task and the loop has no run in progress', async () => {
    const { handler, lines } = quiet({ desired: 1 });
    const summary = { quiet: true, desiredCount: 1, runningJobs: 0, runningRuns: 0 };
    await expect(handler()).resolves.toEqual(summary);
    expect(lines).toEqual([{ message: 'quiet check', detail: summary }]);
  });

  it('[OPS-7] is busy while a job task runs, asking neither the service nor the loop', async () => {
    const { handler, loopAsked, serviceAsked } = quiet({ jobs: 2, desired: 1 });
    await expect(handler()).resolves.toEqual({ quiet: false, runningJobs: 2 });
    expect(loopAsked).toEqual([]);
    expect(serviceAsked).toEqual([]);
  });

  it('[OPS-7] is busy while a run is in progress', async () => {
    const { handler } = quiet({ desired: 1, runs: 1 });
    await expect(handler()).resolves.toEqual({
      quiet: false,
      desiredCount: 1,
      runningJobs: 0,
      runningRuns: 1,
    });
  });

  it('[OPS-7] is quiet when the service is asleep, asking the loop nothing', async () => {
    const { handler, loopAsked } = quiet({ desired: 0 });
    await expect(handler()).resolves.toEqual({
      quiet: true,
      desiredCount: 0,
      runningJobs: 0,
      runningRuns: 0,
    });
    expect(loopAsked).toEqual([]);
  });

  it('[OPS-7] names the count it could not take, and is not quiet then', async () => {
    await expect(quiet({ jobs: 'unknown', desired: 1 }).handler()).resolves.toEqual({
      quiet: false,
      unknown: 'jobs',
    });
    await expect(quiet({ desired: undefined }).handler()).resolves.toEqual({
      quiet: false,
      unknown: 'service',
      runningJobs: 0,
    });
    await expect(quiet({ desired: 1, runs: 'unknown' }).handler()).resolves.toEqual({
      quiet: false,
      unknown: 'loop',
      desiredCount: 1,
      runningJobs: 0,
    });
  });

  it('logs a check that failed and leaves it failed', async () => {
    const { handler, lines } = quiet({ jobs: 'throws' });
    await expect(handler()).rejects.toThrow('ecs down');
    expect(lines).toEqual([
      { message: 'quiet check failed', detail: { error: 'Error: ecs down' } },
    ]);
  });
});
