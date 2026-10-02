import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatElapsed, useNow, useServerNow } from './index';

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

describe('useServerNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  const stamp = (ms: number) => new Date(ms).toISOString();

  it('reads the server’s clock however far the page’s is from it, re-anchoring on every stamp', () => {
    // The page's clock runs ten minutes ahead of the server's.
    const server = Date.now() - 600_000;
    const { result, rerender } = renderHook(({ at, live }) => useServerNow(at, live), {
      initialProps: { at: stamp(server), live: true },
    });
    expect(result.current).toBe(server);

    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current).toBe(server + 2_000);

    // A later read says where the server's clock stood then; it is believed.
    rerender({ at: stamp(server + 2_500), live: true });
    expect(result.current).toBe(server + 2_500);

    rerender({ at: stamp(server + 2_500), live: false });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(server + 2_500);
  });

  // A frozen clock's last reading is older than the stamp that arrives after
  // it: the stamp is where the server's clock stood, so it is never read back.
  it('never reads less than the stamp, whenever the clock last ticked', () => {
    const server = Date.now() + 600_000;
    const { result, rerender } = renderHook(({ at, live }) => useServerNow(at, live), {
      initialProps: { at: null as string | null, live: false },
    });
    act(() => vi.advanceTimersByTime(10_000));
    rerender({ at: stamp(server), live: true });
    expect(result.current).toBe(server);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(server + 1_000);
  });

  it('is the page’s own clock without a stamp it can read', () => {
    const page = Date.now();
    expect(renderHook(() => useServerNow(null, false)).result.current).toBe(page);
    expect(renderHook(() => useServerNow('not an instant', false)).result.current).toBe(page);
  });
});
