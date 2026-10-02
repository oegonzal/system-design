import type { RunHeartbeatDto } from '@sysdesign/contracts';

/**
 * How long a running row may go without a heartbeat before the janitor calls
 * it dead. Read once from the environment; a value that is not a positive
 * integer of milliseconds fails boot with the variable named, never a run.
 *
 * Three minutes by default. The threshold is how long a reader is told
 * "running" about a run nothing is running — a grade whose process died
 * reads "grading…" until it passes — so it is as short as a live run can
 * safely be told from a dead one. The heartbeat is a ticker of
 * its own, every third of the threshold, never a side effect of a model call,
 * so a call that takes many minutes costs no beats: a live row is only ever
 * late by a stalled process or database, three beats in a row. A row swept
 * wrongly is still reclaimed by its owner's close.
 */
export const RUN_STALE_AFTER_VAR = 'QUALITY_LOOP_RUN_STALE_AFTER_MS';
export const DEFAULT_RUN_STALE_AFTER_MS = 180_000;
/** How many heartbeats fit in one threshold: the ticker's interval is the threshold over this. */
export const HEARTBEATS_PER_STALE_THRESHOLD = 3;
/** The least a ticker waits between beats, however short the threshold. */
export const MIN_HEARTBEAT_EVERY_MS = 1000;

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

/**
 * How often a run in flight beats: `HEARTBEATS_PER_STALE_THRESHOLD` times per
 * threshold, never faster than `MIN_HEARTBEAT_EVERY_MS` — the one cadence the
 * ticker keeps and `GET /health` reports.
 */
export const heartbeatEveryMs = (staleAfterMs: number): number =>
  Math.max(MIN_HEARTBEAT_EVERY_MS, Math.round(staleAfterMs / HEARTBEATS_PER_STALE_THRESHOLD));

/** The pace the loop's runs keep, from the janitor's own options: what `GET /health` tells a reader. */
export const runHeartbeat = ({
  staleAfterMs,
}: Pick<RunJanitorOptions, 'staleAfterMs'>): RunHeartbeatDto => ({
  heartbeatEveryMs: heartbeatEveryMs(staleAfterMs),
  staleAfterMs,
});
