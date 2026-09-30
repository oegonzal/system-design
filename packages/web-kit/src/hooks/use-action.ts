'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { toErrorMessage } from '../http/request';

export interface Action<A extends unknown[], R> {
  /** Runs the write; answers its result, or null when it failed (the error is on `error`). */
  run(...args: A): Promise<R | null>;
  pending: boolean;
  error: string | null;
  /** Clears the error, e.g. when the form changes. */
  reset(): void;
}

/**
 * One write a page makes — save, run, fetch. `pending` while it is in
 * flight, `error` when it failed, and nothing set after unmount.
 */
export function useAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): Action<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef(action);
  latest.current = action;

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const run = useCallback(async (...args: A): Promise<R | null> => {
    setPending(true);
    setError(null);
    try {
      return await latest.current(...args);
    } catch (failure: unknown) {
      if (mounted.current) setError(toErrorMessage(failure, 'the request failed'));
      return null;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
