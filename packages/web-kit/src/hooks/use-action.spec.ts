import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAction } from './use-action';

describe('useAction', () => {
  it('runs the write, is pending meanwhile, and answers its result', async () => {
    let release!: (value: number) => void;
    const { result } = renderHook(() =>
      useAction((n: number) => new Promise<number>((resolve) => (release = (v) => resolve(v + n)))),
    );
    let answer: Promise<number | null> | undefined;
    act(() => {
      answer = result.current.run(2);
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    act(() => release(40));
    expect(await answer).toBe(42);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('answers null and keeps the message when the write fails, until reset', async () => {
    const { result } = renderHook(() =>
      useAction(async () => {
        throw new Error('409: already exists');
      }),
    );
    let answer: unknown;
    await act(async () => {
      answer = await result.current.run();
    });
    expect(answer).toBeNull();
    expect(result.current.error).toBe('409: already exists');
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });
});
