/**
 * How long a running row may go without a heartbeat before the janitor calls
 * it dead. Read once from the environment; a value that is not a positive
 * integer of milliseconds fails boot with the variable named, never a run.
 */
export const RUN_STALE_AFTER_VAR = 'QUALITY_LOOP_RUN_STALE_AFTER_MS';
export const DEFAULT_RUN_STALE_AFTER_MS = 600_000;

export interface RunJanitorOptions {
  /** A running row whose heartbeat is older than this is failed. */
  staleAfterMs: number;
  /** How often the sweep runs after boot; null sweeps at boot only. */
  intervalMs: number | null;
}

export function runStaleAfterMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[RUN_STALE_AFTER_VAR];
  if (raw === undefined || raw.trim() === '') return DEFAULT_RUN_STALE_AFTER_MS;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0) {
    throw new Error(
      `${RUN_STALE_AFTER_VAR} must be a positive integer of milliseconds, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

/** The options from the environment: the sweep runs as often as a row may stay silent. */
export function runJanitorOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): RunJanitorOptions {
  const staleAfterMs = runStaleAfterMs(env);
  return { staleAfterMs, intervalMs: staleAfterMs };
}
