import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatElapsed, useElapsed } from './elapsed';

describe('formatElapsed', () => {
  it('prints minutes and zero-padded seconds, never negative', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(-3_000)).toBe('0:00');
  });
});

describe('useElapsed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:01:30.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('[EVAL-1] counts from the server-stamped start while live, and stops when it is not', () => {
    const { result, rerender } = renderHook(
      ({ live }) => useElapsed('2026-10-01T12:00:00.000Z', live),
      {
        initialProps: { live: true },
      },
    );
    expect(result.current).toBe('1:30');

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe('1:32');

    rerender({ live: false });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe('1:32');
  });

  it('has nothing to say without a start', () => {
    const { result } = renderHook(() => useElapsed(null, true));
    expect(result.current).toBeNull();
  });
});
