/**
 * A job a process runs in the background on a schedule — a sweep, a
 * heartbeat — on a timer that never holds the process open, every failure
 * reported and none thrown. A run slower than its schedule is never started
 * beside the one before it, and stopping resolves once the run in flight has
 * finished, so nothing a run holds — a pooled connection, a transaction —
 * outlives the stop. Measured 2026-10-11: closing a store while a run's query
 * was still opening a fresh connection hung the process for good, 30 times in
 * 30 — the closing driver handed the query a client it then never released,
 * and the pool's end waited on it — so whoever owns a job awaits its stop
 * before the store closes.
 */
export interface Periodic {
  /** No run starts after this; resolves once the one in flight, if any, has finished. */
  stop(): Promise<void>;
}

export function startPeriodic(
  schedule: {
    /** Time between runs; null never runs, which is how a spec keeps the timer to itself. */
    everyMs: number | null;
    /** True runs once at the start; false waits one interval first. */
    atStart: boolean;
  },
  run: () => Promise<unknown>,
  report: (error: unknown) => void,
): Periodic {
  const { everyMs } = schedule;
  if (everyMs === null) return { stop: async () => undefined };
  let inFlight: Promise<void> | null = null;
  const tick = (): void => {
    // A run slower than its schedule is not started twice at once.
    if (inFlight !== null) return;
    inFlight = run()
      .then(
        () => undefined,
        (error: unknown) => report(error),
      )
      .finally(() => {
        inFlight = null;
      });
  };
  if (schedule.atStart) tick();
  const timer = setInterval(tick, everyMs);
  // Node's timers can be told not to hold the process open; a browser's cannot, and need not.
  (timer as unknown as { unref?: () => void }).unref?.();
  return {
    stop: async () => {
      clearInterval(timer);
      await inFlight;
    },
  };
}
