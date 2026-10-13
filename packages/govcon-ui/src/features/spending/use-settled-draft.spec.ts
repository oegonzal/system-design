import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettledDraft } from './use-settled-draft';

interface Draft {
  a: string;
  b: number;
}
const VALUE: Draft = { a: 'start', b: 1 };

describe('useSettledDraft', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('[GOVU-12] echoes what is typed at once and hands it on after the pause, restarting the pause on every keystroke, the echo kept until a commit', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSettledDraft(VALUE, onChange, 300));
    act(() => result.current.type({ a: 'x' }));
    expect(result.current.shown).toEqual({ a: 'x', b: 1 });
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.type({ a: 'xy' }));
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ a: 'xy', b: 1 });
    expect(result.current.shown.a).toBe('xy');
  });

  it('[GOVU-12] a commit hands the merged draft on at once and ends the echo, a settle hands on only what is pending, an outside value shows through, and an unmount hands nothing on', () => {
    const onChange = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useSettledDraft(value, onChange, 300),
      { initialProps: { value: VALUE } },
    );
    act(() => result.current.type({ a: 'x' }));
    act(() => result.current.commit({ b: 2 }));
    expect(onChange).toHaveBeenLastCalledWith({ a: 'x', b: 2 });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender({ value: { a: 'x', b: 2 } });
    expect(result.current.shown).toEqual({ a: 'x', b: 2 });
    rerender({ value: { a: 'outside', b: 2 } });
    expect(result.current.shown.a).toBe('outside');

    act(() => result.current.type({ a: 'y' }));
    act(() => result.current.settle());
    expect(onChange).toHaveBeenLastCalledWith({ a: 'y', b: 2 });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(result.current.shown.a).toBe('outside');
    act(() => result.current.settle());
    expect(onChange).toHaveBeenCalledTimes(2);

    act(() => result.current.type({ a: 'z' }));
    unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
