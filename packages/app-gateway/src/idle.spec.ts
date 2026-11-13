import { createIdleHandler, NO_OBSERVATION, type IdleState } from './idle';
import { recordedLog } from './testing';

const MINUTE = 60_000;
const START = Date.parse('2026-11-11T12:00:00.000Z');

/** The state parameter as the stack creates it: present, with the value that is not a time. */
const INITIAL = NO_OBSERVATION;

/**
 * An idle handler over fakes: the proxy's invocations, the service's desired
 * count, the cluster's job tasks (none unless said, `unknown` when ECS could
 * not be asked, `stopped` the ones the count stopped over the ceiling), the
 * loop's answer, a state in memory, a clock.
 */
function idle(options: {
  invocations: number;
  desired: number | undefined;
  jobs?: number | 'unknown';
  stopped?: number;
  running?: number;
  state?: string;
}) {
  const set: number[] = [];
  const asked: number[] = [];
  const written: string[] = [];
  const loopAsked: number[] = [];
  let clock = START;
  let kept = options.state;
  const state: IdleState = {
    read: async () => kept,
    write: async (value) => {
      kept = value;
      written.push(value);
    },
    clear: async () => {
      kept = NO_OBSERVATION;
    },
  };
  const { log, lines } = recordedLog();
  const handler = createIdleHandler({
    metrics: {
      invocationsSince: async (minutes) => {
        asked.push(minutes);
        return options.invocations;
      },
    },
    service: {
      desiredCount: async () => options.desired,
      setDesiredCount: async (count) => void set.push(count),
    },
    jobs: {
      count: async () =>
        options.jobs === 'unknown'
          ? undefined
          : { running: options.jobs ?? 0, stopped: options.stopped ?? 0 },
    },
    loop: {
      runningRuns: async () => {
        loopAsked.push(1);
        return options.running;
      },
    },
    state,
    idleMinutes: 15,
    confirmMinutes: 5,
    log,
    now: () => clock,
  });
  return {
    handler,
    set,
    asked,
    written,
    loopAsked,
    lines,
    kept: () => kept,
    advance: (minutes: number) => (clock += minutes * MINUTE),
    options,
  };
}

describe('the idle check', () => {
  it('writes the first quiet observation and stops nothing; stops on the second, a confirm interval later', async () => {
    const run = idle({ invocations: 0, desired: 1, running: 0, state: INITIAL });
    const first = await run.handler();
    expect(first).toEqual({
      outcome: 'quiet-once',
      idleMinutes: 15,
      invocations: 0,
      desiredCount: 1,
      quietSince: '2026-11-11T12:00:00.000Z',
    });
    expect(run.written).toEqual(['2026-11-11T12:00:00.000Z']);
    expect(run.set).toEqual([]);
    expect(run.asked).toEqual([15]);

    run.advance(5);
    const second = await run.handler();
    expect(second).toEqual({
      outcome: 'stopped',
      idleMinutes: 15,
      invocations: 0,
      desiredCount: 1,
      quietSince: '2026-11-11T12:00:00.000Z',
      runningJobs: 0,
      stoppedJobs: 0,
      runningRuns: 0,
    });
    expect(run.set).toEqual([0]);
    expect(run.kept()).toBe(NO_OBSERVATION);
    expect(run.lines.map(({ message }) => message)).toEqual(['idle check', 'idle check']);
  });

  it('keeps waiting while the observation is younger than the confirm interval, asking the loop nothing', async () => {
    const run = idle({ invocations: 0, desired: 1, running: 0 });
    await run.handler();
    run.advance(4);
    const again = await run.handler();
    expect(again.outcome).toBe('quiet-once');
    expect(again.quietSince).toBe('2026-11-11T12:00:00.000Z');
    expect(run.written).toHaveLength(1);
    expect(run.set).toEqual([]);
    expect(run.loopAsked).toEqual([]);
  });

  it('reads a quiet observation written before: no run of its own is needed to confirm', async () => {
    const run = idle({ invocations: 0, desired: 1, running: 0, state: '2026-11-11T11:50:00.000Z' });
    expect((await run.handler()).outcome).toBe('stopped');
    expect(run.set).toEqual([0]);
  });

  it('clears the observation and reports active when the proxy was used, without asking the loop', async () => {
    const run = idle({ invocations: 3, desired: 1, running: 0, state: '2026-11-11T11:50:00.000Z' });
    expect(await run.handler()).toEqual({ outcome: 'active', idleMinutes: 15, invocations: 3 });
    expect(run.kept()).toBe(NO_OBSERVATION);
    expect(run.set).toEqual([]);
  });

  it('keeps the service, and the observation, while a run is in progress', async () => {
    const run = idle({ invocations: 0, desired: 1, running: 1, state: '2026-11-11T11:50:00.000Z' });
    const summary = await run.handler();
    expect(summary.outcome).toBe('busy');
    expect(summary.runningRuns).toBe(1);
    expect(summary.runningJobs).toBe(0);
    expect(run.set).toEqual([]);
    expect(run.kept()).toBe('2026-11-11T11:50:00.000Z');
  });

  it('[OPS-3] keeps the service while a job task runs beside it, asking the loop nothing', async () => {
    const run = idle({
      invocations: 0,
      desired: 1,
      jobs: 1,
      running: 0,
      state: '2026-11-11T11:50:00.000Z',
    });
    const summary = await run.handler();
    expect(summary).toEqual({
      outcome: 'busy',
      idleMinutes: 15,
      invocations: 0,
      desiredCount: 1,
      quietSince: '2026-11-11T11:50:00.000Z',
      runningJobs: 1,
      stoppedJobs: 0,
    });
    expect(run.loopAsked).toEqual([]);
    expect(run.set).toEqual([]);
    expect(run.kept()).toBe('2026-11-11T11:50:00.000Z');
  });

  it('[OPS-6] carries the jobs stopped over the ceiling, and goes on to the loop when none runs besides them', async () => {
    const run = idle({
      invocations: 0,
      desired: 1,
      jobs: 0,
      stopped: 1,
      running: 0,
      state: '2026-11-11T11:50:00.000Z',
    });
    const summary = await run.handler();
    expect(summary).toEqual({
      outcome: 'stopped',
      idleMinutes: 15,
      invocations: 0,
      desiredCount: 1,
      quietSince: '2026-11-11T11:50:00.000Z',
      runningJobs: 0,
      stoppedJobs: 1,
      runningRuns: 0,
    });
    expect(run.loopAsked).toEqual([1]);
    expect(run.set).toEqual([0]);

    const besides = idle({
      invocations: 0,
      desired: 1,
      jobs: 1,
      stopped: 2,
      running: 0,
      state: '2026-11-11T11:50:00.000Z',
    });
    expect(await besides.handler()).toMatchObject({
      outcome: 'busy',
      runningJobs: 1,
      stoppedJobs: 2,
    });
    expect(besides.set).toEqual([]);
  });

  it('[OPS-3] does nothing when the tasks could not be counted, keeping the observation for the next run', async () => {
    const run = idle({
      invocations: 0,
      desired: 1,
      jobs: 'unknown',
      running: 0,
      state: '2026-11-11T11:50:00.000Z',
    });
    const summary = await run.handler();
    expect(summary.outcome).toBe('jobs-unknown');
    expect(summary).not.toHaveProperty('runningJobs');
    expect(summary).not.toHaveProperty('stoppedJobs');
    expect(run.loopAsked).toEqual([]);
    expect(run.set).toEqual([]);
    expect(run.kept()).toBe('2026-11-11T11:50:00.000Z');
  });

  it('does nothing when the loop cannot be asked, keeping the observation for the next run', async () => {
    const run = idle({
      invocations: 0,
      desired: 1,
      running: undefined,
      state: '2026-11-11T11:50:00.000Z',
    });
    expect((await run.handler()).outcome).toBe('loop-unreachable');
    expect(run.set).toEqual([]);
    expect(run.kept()).toBe('2026-11-11T11:50:00.000Z');
  });

  it('does nothing when the service is already asleep, clearing a stale observation, or when it is not found', async () => {
    const asleep = idle({
      invocations: 0,
      desired: 0,
      running: 0,
      state: '2026-11-11T11:50:00.000Z',
    });
    const unknown = idle({ invocations: 0, desired: undefined, running: 0 });
    expect((await asleep.handler()).outcome).toBe('asleep');
    expect(asleep.kept()).toBe(NO_OBSERVATION);
    expect((await unknown.handler()).outcome).toBe('service-unknown');
    expect([asleep.set, unknown.set]).toEqual([[], []]);
  });

  it('logs a check that failed and leaves it failed', async () => {
    const { log, lines } = recordedLog();
    const handler = createIdleHandler({
      metrics: {
        invocationsSince: async () => {
          throw new Error('cloudwatch down');
        },
      },
      service: { desiredCount: async () => 1, setDesiredCount: async () => undefined },
      jobs: { count: async () => ({ running: 0, stopped: 0 }) },
      loop: { runningRuns: async () => 0 },
      state: {
        read: async () => undefined,
        write: async () => undefined,
        clear: async () => undefined,
      },
      idleMinutes: 15,
      confirmMinutes: 5,
      log,
    });
    await expect(handler()).rejects.toThrow('cloudwatch down');
    expect(lines).toEqual([
      { message: 'idle check failed', detail: { error: 'Error: cloudwatch down' } },
    ]);
  });
});
