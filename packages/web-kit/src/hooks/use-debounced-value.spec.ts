import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('settles on the last value once the delay has passed without a change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');
    rerender({ value: 'ab' });
    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(60));
    expect(result.current).toBe('abc');
  });
});
