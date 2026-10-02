'use client';

import type { RunHeartbeatDto } from '@sysdesign/contracts';
import { formatElapsed, useServerNow } from '@sysdesign/web-kit/clock';

/**
 * How many beats a running run may miss before the studio says it has gone
 * quiet: two, so one late beat never trips it.
 */
export const BEATS_MISSED_BEFORE_SILENCE = 2;

/**
 * How long a running run may go without a sign of life before the studio
 * says so, from the pace the loop itself reports (`RunHeartbeatDto`): a run
 * beats every `heartbeatEveryMs` and on every write, and is given up as failed
 * once its beat is older than `staleAfterMs`. So: `BEATS_MISSED_BEFORE_SILENCE`
 * beats, and never past the stale window, so the author hears no later than
 * the loop gives the run up. One rule, read by the grade and the coach alike.
 */
export const silenceToleranceMs = ({ heartbeatEveryMs, staleAfterMs }: RunHeartbeatDto): number =>
  Math.min(BEATS_MISSED_BEFORE_SILENCE * heartbeatEveryMs, staleAfterMs);

/** A run as the clock reads it: when it started, when it last said it was alive, and when it was read. */
export interface RunTimes {
  /** An ISO instant the server stamped; null before the page has read the run. */
  startedAt: string | null;
  heartbeatAt: string | null;
  /** When the server read the run, on its own clock — what the two above are measured against. */
  readAt: string | null;
}

export interface Liveness {
  /** `m:ss` since the run started; null without a start it can read. */
  elapsed: string | null;
  /**
   * Whole minutes since the run's last sign of life, once that silence has
   * passed the tolerance; null while the run reports, without a beat to
   * measure from, and without the loop's pace to judge it by.
   */
  silentMinutes: number | null;
}

const instantOf = (stamp: string | null): number | null => {
  if (stamp === null) return null;
  const instant = Date.parse(stamp);
  return Number.isNaN(instant) ? null : instant;
};

/**
 * What the clock says of a run at `now` — an instant on the server's clock —
 * by the pace the loop reports (`heartbeat`), null until the page has read
 * it. Pure, so the rule is specced without timers.
 */
export function livenessAt(
  { startedAt, heartbeatAt }: RunTimes,
  now: number,
  heartbeat: RunHeartbeatDto | null,
): Liveness {
  const started = instantOf(startedAt);
  const beat = instantOf(heartbeatAt);
  const silence = beat === null ? 0 : now - beat;
  return {
    elapsed: started === null ? null : formatElapsed(now - started),
    silentMinutes:
      heartbeat !== null && silence >= silenceToleranceMs(heartbeat)
        ? Math.floor(silence / 60_000)
        : null,
  };
}

/**
 * How long a run has been going and whether it has gone quiet, ticking
 * while `live` and frozen on its last reading once it is not. Measured on
 * the server's clock — the run's own `readAt`, advanced by the page's clock
 * since it arrived (web-kit's `useServerNow`) — so a page whose clock is
 * off can neither raise the warning nor hide it; the tolerance is the loop's
 * own pace, through `silenceToleranceMs`.
 */
export function useLiveness(
  times: RunTimes,
  live: boolean,
  heartbeat: RunHeartbeatDto | null,
): Liveness {
  const now = useServerNow(
    times.readAt,
    live && (times.startedAt !== null || times.heartbeatAt !== null),
  );
  return livenessAt(times, now, heartbeat);
}

/**
 * What the panel says of a run that has gone quiet, for its author — under a
 * minute only on a loop whose pace is brisker than its default.
 */
export const silenceCopy = (minutes: number): string =>
  minutes < 1
    ? 'The grader has not reported for under a minute.'
    : `The grader has not reported for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;

/** What follows it: what the loop does with a run that stays quiet, and what the author can do then. */
export const SILENCE_BODY =
  'If it stays quiet, the grader gives the run up and marks it failed — and it can be started again from here.';
