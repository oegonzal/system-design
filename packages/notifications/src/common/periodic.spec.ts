import { startPeriodic } from './periodic';

describe('a periodic sweep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('[NTF-3] runs at boot and on its schedule, logs a failure without throwing, and never runs when it has no schedule', async () => {
    vi.useFakeTimers();
    let runs = 0;
    const warnings: string[] = [];
    const periodic = startPeriodic(
      1_000,
      async () => {
        runs += 1;
        if (runs === 2) throw new Error('the store went away');
      },
      (message) => warnings.push(message),
    );
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(runs).toBe(3);
    expect(warnings).toEqual(['sweep failed: Error: the store went away']);
    periodic.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBe(3);

    let never = 0;
    startPeriodic(
      null,
      async () => {
        never += 1;
      },
      () => undefined,
    ).stop();
    expect(never).toBe(0);
  });
});
