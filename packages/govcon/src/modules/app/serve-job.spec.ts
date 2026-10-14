import { cadenceOfHours, ServeJob } from './serve-job';

const HOUR = 60 * 60 * 1000;

function harness() {
  const lines: string[] = [];
  const errors: string[] = [];
  const job = new ServeJob('nightly count', {
    log: (message) => lines.push(message),
    error: (message) => errors.push(message),
  });
  return { job, lines, errors };
}

describe('a job serve starts', () => {
  it('[GOV-22] runs once at the start and then on its cadence, told which of the two a run is, starts once however often it is told to, and runs no more once stopped', async () => {
    const { job, lines } = harness();
    const runs: boolean[] = [];
    const run = async (onCadence: boolean) => {
      runs.push(onCadence);
    };
    vi.useFakeTimers();
    try {
      job.start({ everyMs: 2 * HOUR }, run);
      job.start({ everyMs: 2 * HOUR }, run);
      await vi.advanceTimersByTimeAsync(0);
      expect(runs).toEqual([false]);
      await vi.advanceTimersByTimeAsync(2 * HOUR);
      await vi.advanceTimersByTimeAsync(2 * HOUR);
      expect(runs).toEqual([false, true, true]);
      expect(lines).toEqual(['nightly count every 2 h']);
      await job.stop();
      await vi.advanceTimersByTimeAsync(2 * HOUR);
      expect(runs).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('[GOV-22] a cadence of null runs nothing and says so, a stop is safe before any start, a run that throws is one line and the cadence goes on, and once destroyed it starts nothing', async () => {
    const off = harness();
    const never = vi.fn(async () => undefined);
    await off.job.stop();
    off.job.start({ everyMs: null }, never);
    expect(never).not.toHaveBeenCalled();
    expect(off.lines).toEqual(['nightly count off']);
    await off.job.stop();

    vi.useFakeTimers();
    try {
      const failing = harness();
      let calls = 0;
      failing.job.start({ everyMs: HOUR }, async () => {
        calls += 1;
        if (calls === 1) throw new Error('store asleep');
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(failing.errors).toEqual(['nightly count failed: store asleep']);
      await vi.advanceTimersByTimeAsync(HOUR);
      expect(calls).toBe(2);
      await failing.job.stop();

      // A service told to stop while still booting reaches start after its store has closed.
      const gone = harness();
      const late = vi.fn(async () => undefined);
      await gone.job.destroy();
      gone.job.start({ everyMs: HOUR }, late);
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      expect(late).not.toHaveBeenCalled();
      expect(gone.lines).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('[GOV-22] reads a cadence in hours as the environment spells it: the fallback when absent or nonsense, a value, and zero as never', () => {
    expect(cadenceOfHours(undefined, 24)).toEqual({ everyMs: 24 * HOUR });
    expect(cadenceOfHours('6', 24)).toEqual({ everyMs: 6 * HOUR });
    expect(cadenceOfHours('0', 24)).toEqual({ everyMs: null });
    expect(cadenceOfHours('often', 24)).toEqual({ everyMs: 24 * HOUR });
  });
});
