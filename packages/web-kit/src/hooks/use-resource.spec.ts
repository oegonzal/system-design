import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError, UNREACHABLE_COPY } from '../http/request';
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

  it('reports a failure as copy and as what was thrown, and clears both on the next load', async () => {
    const dropped = new TypeError('Failed to fetch');
    let fail = true;
    const { result } = renderHook(() =>
      useResource(async () => {
        if (fail) throw dropped;
        return 'ok';
      }, []),
    );
    // The browser's words never reach the page; the caller classifies the cause.
    await waitFor(() => expect(result.current.error).toBe(UNREACHABLE_COPY));
    expect(result.current.failure).toBe(dropped);
    expect(result.current.loading).toBe(false);
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.error).toBeNull();
    expect(result.current.failure).toBeNull();
  });

  it('words a refusal in the server’s copy, or in the caller’s fallback for the unanswered', async () => {
    const refused = renderHook(() =>
      useResource(
        async () => {
          throw new ApiError(500, { statusCode: 500, message: 'The store is down' });
        },
        [],
        { fallback: 'Could not load the thing.' },
      ),
    );
    await waitFor(() => expect(refused.result.current.error).toBe('The store is down'));

    const dropped = renderHook(() =>
      useResource(
        async () => {
          throw new TypeError('Failed to fetch');
        },
        [],
        { fallback: 'Could not load the thing.' },
      ),
    );
    await waitFor(() => expect(dropped.result.current.error).toBe('Could not load the thing.'));
  });

  it('takes a write’s answer in place of the loaded data without reading again', async () => {
    let loads = 0;
    const { result } = renderHook(() =>
      useResource(async () => {
        loads += 1;
        return 'loaded';
      }, []),
    );
    await waitFor(() => expect(result.current.data).toBe('loaded'));
    act(() => result.current.replace('written'));
    expect(result.current.data).toBe('written');
    expect(loads).toBe(1);
  });
});
