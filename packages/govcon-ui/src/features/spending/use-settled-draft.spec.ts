import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettledDraft } from './use-settled-draft';

interface Draft {
  a: string;
  b: number;
}
const VALUE: Draft = { a: 'start', b: 1 };

function mount(onChange: (next: Draft) => void) {
  return renderHook(({ value }) => useSettledDraft(value, onChange, 300), {
    initialProps: { value: VALUE },
  });
}

describe('useSettledDraft', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('[GOVU-12] echoes every change at once and hands a run of them on as one once they pause, the pause restarting on each', () => {
    const onChange = vi.fn();
    const { result } = mount(onChange);
    act(() => result.current.settleLater({ a: 'x' }));
    expect(result.current.shown).toEqual({ a: 'x', b: 1 });
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.settleLater({ a: 'xy' }));
    act(() => result.current.settleLater({ b: 2 }));
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ a: 'xy', b: 2 });
    // Until the owner answers, the control still shows what was drafted.
    expect(result.current.shown).toEqual({ a: 'xy', b: 2 });
  });

  it('[GOVU-12] gives way to the owner’s value once it moves after a hand-on — its own spelling, then any outside change — and keeps the echo while it does not move', () => {
    const onChange = vi.fn();
    const { result, rerender } = mount(onChange);
    act(() => result.current.settleLater({ a: 'x ,' }));
    act(() => vi.advanceTimersByTime(300));
    // The owner holds the same view: nothing moved, so the text stays as typed.
    rerender({ value: VALUE });
    expect(result.current.shown.a).toBe('x ,');
    // The owner answers with its own spelling, and later with a change from outside.
    rerender({ value: { a: 'x', b: 1 } });
    expect(result.current.shown).toEqual({ a: 'x', b: 1 });
    rerender({ value: { a: 'outside', b: 1 } });
    expect(result.current.shown.a).toBe('outside');
  });

  it('[GOVU-12] a commit hands the draft on at once with what is pending, a field left hands on only what is pending, and an unmount hands nothing on', () => {
    const onChange = vi.fn();
    const { result, rerender, unmount } = mount(onChange);
    act(() => result.current.settleLater({ a: 'x' }));
    act(() => result.current.commit({ b: 2 }));
    expect(onChange).toHaveBeenLastCalledWith({ a: 'x', b: 2 });
    expect(result.current.shown).toEqual({ a: 'x', b: 2 });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender({ value: { a: 'x', b: 2 } });

    act(() => result.current.settleLater({ a: 'y' }));
    act(() => result.current.settleNow());
    expect(onChange).toHaveBeenLastCalledWith({ a: 'y', b: 2 });
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => result.current.settleNow());
    expect(onChange).toHaveBeenCalledTimes(2);

    act(() => result.current.settleLater({ a: 'z' }));
    unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
