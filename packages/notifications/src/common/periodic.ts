/**
 * A sweep run at boot and then every so often, on a timer that never holds
 * the process open, its failures logged and never thrown: a sweep that fails
 * leaves the service serving and tries again next time. `every: null` runs it
 * never, which is how a spec keeps its timers to itself.
 */
export interface Periodic {
  stop(): void;
}

export function startPeriodic(
  every: number | null,
  sweep: () => Promise<unknown>,
  warn: (message: string) => void,
): Periodic {
  if (every === null) return { stop: () => undefined };
  const run = (): void => {
    sweep().catch((error: unknown) => warn(`sweep failed: ${String(error)}`));
  };
  run();
  const timer = setInterval(run, every);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
