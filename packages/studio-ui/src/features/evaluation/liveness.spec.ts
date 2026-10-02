import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeHeartbeat } from '../../testing/fixtures';
import {
  BEATS_MISSED_BEFORE_SILENCE,
  livenessAt,
  silenceCopy,
  silenceToleranceMs,
  useLiveness,
} from './liveness';

const NOW = Date.parse('2026-10-01T12:01:30.000Z');
const at = (msAgo: number, now = NOW) => new Date(now - msAgo).toISOString();
const PACE = makeHeartbeat();
/** The loop's default pace tolerates two missed beats: two minutes. */
const TOLERANCE = 120_000;

describe('silenceToleranceMs', () => {
  it('[EVAL-1] tolerates two missed beats of the loop’s own pace, and never past its stale window', () => {
    expect(BEATS_MISSED_BEFORE_SILENCE).toBe(2);
    expect(silenceToleranceMs(PACE)).toBe(TOLERANCE);
    expect(silenceToleranceMs({ heartbeatEveryMs: 5_000, staleAfterMs: 15_000 })).toBe(10_000);
    // A pace whose two beats outlast the window: the author hears when the loop gives up.
    expect(silenceToleranceMs({ heartbeatEveryMs: 1_000, staleAfterMs: 1_500 })).toBe(1_500);
  });
});

describe('livenessAt', () => {
  const times = (startedAgo: number, beatAgo: number) => ({
    startedAt: at(startedAgo),
    heartbeatAt: at(beatAgo),
    readAt: at(0),
  });

  it('[EVAL-1] counts from the server-stamped start, and says nothing of a run that reports within the tolerance', () => {
    expect(livenessAt(times(90_000, 1_000), NOW, PACE)).toEqual({
      elapsed: '1:30',
      silentMinutes: null,
    });
    expect(livenessAt(times(90_000, TOLERANCE - 1), NOW, PACE).silentMinutes).toBeNull();
  });

  it('[EVAL-1] says how many whole minutes a run has been quiet once the silence passes the tolerance', () => {
    expect(livenessAt(times(300_000, TOLERANCE), NOW, PACE)).toEqual({
      elapsed: '5:00',
      silentMinutes: 2,
    });
    expect(livenessAt(times(900_000, 419_000), NOW, PACE)).toEqual({
      elapsed: '15:00',
      silentMinutes: 6,
    });
  });

  it('[EVAL-1] judges by the pace the loop reports, and claims no silence before it knows one', () => {
    const brisk = { heartbeatEveryMs: 5_000, staleAfterMs: 15_000 };
    expect(livenessAt(times(60_000, 12_000), NOW, brisk).silentMinutes).toBe(0);
    expect(livenessAt(times(60_000, 9_000), NOW, brisk).silentMinutes).toBeNull();
    expect(livenessAt(times(900_000, 600_000), NOW, null)).toEqual({
      elapsed: '15:00',
      silentMinutes: null,
    });
  });

  it('has nothing to say without a start or a beat it can read', () => {
    expect(livenessAt({ startedAt: null, heartbeatAt: null, readAt: null }, NOW, PACE)).toEqual({
      elapsed: null,
      silentMinutes: null,
    });
    expect(
      livenessAt({ startedAt: 'not an instant', heartbeatAt: 'nor this', readAt: null }, NOW, PACE),
    ).toEqual({ elapsed: null, silentMinutes: null });
    // A beat can be read without a start: the silence is still measured.
    expect(
      livenessAt({ startedAt: null, heartbeatAt: at(180_000), readAt: null }, NOW, PACE)
        .silentMinutes,
    ).toBe(3);
  });
});

describe('useLiveness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('[EVAL-1] ticks while live — the silence grows between polls — and freezes on its last reading once it is not', () => {
    const { result, rerender } = renderHook(
      ({ live }) =>
        useLiveness(
          { startedAt: at(90_000), heartbeatAt: at(TOLERANCE - 1500), readAt: at(0) },
          live,
          PACE,
        ),
      { initialProps: { live: true } },
    );
    expect(result.current).toEqual({ elapsed: '1:30', silentMinutes: null });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toEqual({ elapsed: '1:32', silentMinutes: 2 });

    rerender({ live: false });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toEqual({ elapsed: '1:32', silentMinutes: 2 });
  });

  // The page's clock is the author's machine's: an hour off either way, it
  // once raised a warning over a run beating on time, or hid one that had
  // stopped. The run's times are measured against the server's own read.
  it('[EVAL-1] measures on the server’s clock, so the page’s clock can neither raise a silence nor hide one', () => {
    const behind = NOW - 3_600_000;
    const ahead = NOW + 3_600_000;
    const onServer = (server: number, startedAgo: number, beatAgo: number) => ({
      startedAt: at(startedAgo, server),
      heartbeatAt: at(beatAgo, server),
      readAt: at(0, server),
    });

    // The server an hour behind the page: a run that beat five seconds ago is not quiet.
    expect(
      renderHook(() => useLiveness(onServer(behind, 90_000, 5_000), true, PACE)).result.current,
    ).toEqual({ elapsed: '1:30', silentMinutes: null });
    // The server an hour ahead: a run quiet for three minutes is.
    expect(
      renderHook(() => useLiveness(onServer(ahead, 400_000, 190_000), true, PACE)).result.current,
    ).toEqual({ elapsed: '6:40', silentMinutes: 3 });
  });

  it('never ticks without a run to time', () => {
    const { result } = renderHook(() =>
      useLiveness({ startedAt: null, heartbeatAt: null, readAt: null }, true, PACE),
    );
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toEqual({ elapsed: null, silentMinutes: null });
  });
});

describe('silenceCopy', () => {
  it('names the minutes, singular and plural, and under a minute on a brisk pace', () => {
    expect(silenceCopy(0)).toBe('The grader has not reported for under a minute.');
    expect(silenceCopy(1)).toBe('The grader has not reported for 1 minute.');
    expect(silenceCopy(4)).toBe('The grader has not reported for 4 minutes.');
  });
});
