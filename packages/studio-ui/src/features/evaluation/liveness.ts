'use client';

import { formatElapsed, useNow } from '@sysdesign/web-kit/clock';

/**
 * How long a running run may go without a sign of life before the studio
 * says so. The loop beats every third of its stale window — 60 s by default
 * — and on every write, and sweeps a run whose beat is older than the window
 * (180 s) as failed; the cadence itself is not on the wire, so this is the
 * studio's own tolerance: twice the default cadence, so one late beat never
 * trips it, and short of the default window, so the author hears before the
 * loop gives the run up. One constant, read by the grade and the coach alike.
 */
export const HEARTBEAT_SILENCE_MS = 120_000;

/** A run as the clock reads it: when it started, and when it last said it was alive. */
export interface RunTimes {
  /** An ISO instant the server stamped; null before the page has read the run. */
  startedAt: string | null;
  heartbeatAt: string | null;
}

export interface Liveness {
  /** `m:ss` since the run started; null without a start it can read. */
  elapsed: string | null;
  /**
   * Whole minutes since the run's last sign of life, once that silence has
   * passed the tolerance; null while the run reports, and without a beat
   * to measure from.
   */
  silentMinutes: number | null;
}

const instantOf = (stamp: string | null): number | null => {
  if (stamp === null) return null;
  const instant = Date.parse(stamp);
  return Number.isNaN(instant) ? null : instant;
};

/** What the clock says of a run at `now`: pure, so the rule is specced without timers. */
export function livenessAt({ startedAt, heartbeatAt }: RunTimes, now: number): Liveness {
  const started = instantOf(startedAt);
  const beat = instantOf(heartbeatAt);
  const silence = beat === null ? 0 : now - beat;
  return {
    elapsed: started === null ? null : formatElapsed(now - started),
    silentMinutes: silence >= HEARTBEAT_SILENCE_MS ? Math.floor(silence / 60_000) : null,
  };
}

/**
 * How long a run has been going and whether it has gone quiet, ticking
 * while `live` and frozen on its last reading once it is not. The clock
 * and its `m:ss` are web-kit's, so every app counts the same way; the
 * tolerance is `HEARTBEAT_SILENCE_MS`, declared once above.
 */
export function useLiveness(times: RunTimes, live: boolean): Liveness {
  const now = useNow(live && (times.startedAt !== null || times.heartbeatAt !== null));
  return livenessAt(times, now);
}

/** What the panel says of a run that has gone quiet, for its author. */
export const silenceCopy = (minutes: number): string =>
  `The grader has not reported for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;

/** What follows it: what the loop does with a run that stays quiet, and what the author can do then. */
export const SILENCE_BODY =
  'If it stays quiet, the grader gives the run up and marks it failed — and it can be started again from here.';
