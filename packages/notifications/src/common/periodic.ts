/**
 * A sweep run at boot and then every so often, on a timer that never holds
 * the process open, its failures logged and never thrown: a sweep that fails
 * leaves the service serving and tries again next time. A sweep never
 * overlaps the one before it, and stopping waits for the one in flight, so
 * nothing a sweep holds outlives the stop: measured 2026-10-11, closing the
 * store while a sweep's query was opening a fresh connection hung every time
 * (30 of 30) — the closing driver handed the query a client it then never
 * released, and the pool's end waited on it for good. `every: null` runs it
 * never, which is how a spec keeps its timers to itself.
 */
export interface Periodic {
  /** No sweep starts after this; resolves once the one in flight, if any, has finished. */
  stop(): Promise<void>;
}

export function startPeriodic(
  every: number | null,
  sweep: () => Promise<unknown>,
  warn: (message: string) => void,
): Periodic {
  if (every === null) return { stop: async () => undefined };
  let inFlight: Promise<void> | null = null;
  const run = (): void => {
    // A sweep slower than its schedule is not run twice at once.
    if (inFlight !== null) return;
    inFlight = sweep()
      .then(
        () => undefined,
        (error: unknown) => warn(`sweep failed: ${String(error)}`),
      )
      .finally(() => {
        inFlight = null;
      });
  };
  run();
  const timer = setInterval(run, every);
  timer.unref();
  return {
    stop: async () => {
      clearInterval(timer);
      await inFlight;
    },
  };
}
