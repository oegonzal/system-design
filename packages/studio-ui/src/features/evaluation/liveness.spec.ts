import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HEARTBEAT_SILENCE_MS, livenessAt, silenceCopy, useLiveness } from './liveness';

const NOW = Date.parse('2026-10-01T12:01:30.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('livenessAt', () => {
  it('[EVAL-1] counts from the server-stamped start, and says nothing of a run that reports within the tolerance', () => {
    expect(livenessAt({ startedAt: at(90_000), heartbeatAt: at(1_000) }, NOW)).toEqual({
      elapsed: '1:30',
      silentMinutes: null,
    });
    expect(
      livenessAt({ startedAt: at(90_000), heartbeatAt: at(HEARTBEAT_SILENCE_MS - 1) }, NOW)
        .silentMinutes,
    ).toBeNull();
  });

  it('[EVAL-1] says how many whole minutes a run has been quiet once the silence passes the tolerance', () => {
    expect(
      livenessAt({ startedAt: at(300_000), heartbeatAt: at(HEARTBEAT_SILENCE_MS) }, NOW),
    ).toEqual({ elapsed: '5:00', silentMinutes: 2 });
    expect(livenessAt({ startedAt: at(900_000), heartbeatAt: at(419_000) }, NOW)).toEqual({
      elapsed: '15:00',
      silentMinutes: 6,
    });
  });

  it('has nothing to say without a start or a beat it can read', () => {
    expect(livenessAt({ startedAt: null, heartbeatAt: null }, NOW)).toEqual({
      elapsed: null,
      silentMinutes: null,
    });
    expect(livenessAt({ startedAt: 'not an instant', heartbeatAt: 'nor this' }, NOW)).toEqual({
      elapsed: null,
      silentMinutes: null,
    });
    // A beat can be read without a start: the silence is still measured.
    expect(livenessAt({ startedAt: null, heartbeatAt: at(180_000) }, NOW).silentMinutes).toBe(3);
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
        useLiveness({ startedAt: at(90_000), heartbeatAt: at(HEARTBEAT_SILENCE_MS - 1500) }, live),
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

  it('never ticks without a run to time', () => {
    const { result } = renderHook(() => useLiveness({ startedAt: null, heartbeatAt: null }, true));
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toEqual({ elapsed: null, silentMinutes: null });
  });
});

describe('silenceCopy', () => {
  it('names the minutes, singular and plural', () => {
    expect(silenceCopy(1)).toBe('The grader has not reported for 1 minute.');
    expect(silenceCopy(4)).toBe('The grader has not reported for 4 minutes.');
  });
});
