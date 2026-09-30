import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useResource } from './use-resource';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useResource', () => {
  it('loads on mount, reloads on demand, and keeps the last data while reloading', async () => {
    const loads: string[] = [];
    let answer = 'first';
    const { result } = renderHook(() =>
      useResource(async () => {
        loads.push(answer);
        return answer;
      }, []),
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('first'));
    expect(result.current.loading).toBe(false);
    answer = 'second';
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('second'));
    expect(loads).toEqual(['first', 'second']);
  });

  it('reloads when a dependency changes and never paints a superseded answer', async () => {
    const pending = new Map<string, ReturnType<typeof deferred<string>>>();
    const { result, rerender } = renderHook(
      ({ key }) =>
        useResource(
          async (signal) => {
            const slot = deferred<string>();
            pending.set(key, slot);
            signal.addEventListener('abort', () =>
              slot.reject(new DOMException('gone', 'AbortError')),
            );
            return slot.promise;
          },
          [key],
        ),
      { initialProps: { key: 'a' } },
    );
    rerender({ key: 'b' });
    await waitFor(() => expect(pending.has('b')).toBe(true));
    act(() => pending.get('b')?.resolve('B'));
    await waitFor(() => expect(result.current.data).toBe('B'));
    // The first request was aborted when superseded; an abort is never an error.
    expect(result.current.error).toBeNull();
  });

  it('reports a failure as its message and clears it on the next load', async () => {
    let fail = true;
    const { result } = renderHook(() =>
      useResource(async () => {
        if (fail) throw new Error('connection refused');
        return 'ok';
      }, []),
    );
    await waitFor(() => expect(result.current.error).toBe('connection refused'));
    expect(result.current.loading).toBe(false);
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.error).toBeNull();
  });
});
