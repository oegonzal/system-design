import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatElapsed, useNow } from './index';

describe('formatElapsed', () => {
  it('prints minutes and zero-padded seconds, never negative', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(10 * 60_000 + 59_999)).toBe('10:59');
    expect(formatElapsed(-3_000)).toBe('0:00');
  });
});

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('ticks once a second while live, and freezes on its last reading once it is not', () => {
    const start = Date.now();
    const { result, rerender } = renderHook(({ live }) => useNow(live), {
      initialProps: { live: true },
    });
    expect(result.current).toBe(start);

    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current).toBe(start + 2_000);

    rerender({ live: false });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(start + 2_000);
  });

  it('never ticks when it starts frozen', () => {
    const start = Date.now();
    const { result } = renderHook(() => useNow(false));
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBe(start);
  });
});
