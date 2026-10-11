import { startPeriodic } from './periodic';

describe('a periodic job', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('[NTF-3] [QL-13] [BRW-5] runs at the start when asked, then on its schedule, reports a failure without throwing, and never runs without a schedule', async () => {
    vi.useFakeTimers();
    let runs = 0;
    const reports: unknown[] = [];
    const periodic = startPeriodic(
      { everyMs: 1_000, atStart: true },
      async () => {
        runs += 1;
        if (runs === 2) throw new Error('the store went away');
      },
      (error) => reports.push(error),
    );
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(runs).toBe(3);
    expect(reports).toEqual([new Error('the store went away')]);
    await periodic.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBe(3);

    let waited = 0;
    const later = startPeriodic(
      { everyMs: 1_000, atStart: false },
      async () => {
        waited += 1;
      },
      () => undefined,
    );
    expect(waited).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(waited).toBe(1);
    await later.stop();

    let never = 0;
    await startPeriodic(
      { everyMs: null, atStart: true },
      async () => {
        never += 1;
      },
      () => undefined,
    ).stop();
    expect(never).toBe(0);
  });

  it('[NTF-3] [QL-13] [BRW-5] stops only once the run in flight has finished, and never starts a run slower than its schedule twice at once', async () => {
    vi.useFakeTimers();
    let runs = 0;
    let finish = (): void => undefined;
    const periodic = startPeriodic(
      { everyMs: 1_000, atStart: true },
      () => {
        runs += 1;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
      () => undefined,
    );
    // Three ticks pass while the first run is still going: none starts another.
    await vi.advanceTimersByTimeAsync(3_500);
    expect(runs).toBe(1);
    let stopped = false;
    const stopping = periodic.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBe(1);
  });
});
