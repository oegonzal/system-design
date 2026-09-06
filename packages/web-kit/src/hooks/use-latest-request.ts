'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { isAbortError } from '../http/request';

export interface LatestRequest {
  /** Aborts any in-flight request and issues a new ticket. */
  begin(): { id: number; signal: AbortSignal };
  /** True while `id` is still the newest ticket issued. */
  isCurrent(id: number): boolean;
  /** True when a result/error should be dropped: superseded, or an abort. */
  isStale(id: number, error?: unknown): boolean;
}

/**
 * Last-write-wins fetching. Each `begin()` supersedes (and aborts) the
 * previous request, so a slow response for filter A can never paint over the
 * result of filter B. Aborts count as stale, never as errors.
 */
export function useLatestRequest(): LatestRequest {
  const counter = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const begin = useCallback(() => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    counter.current += 1;
    return { id: counter.current, signal: next.signal };
  }, []);

  const isCurrent = useCallback((id: number) => id === counter.current, []);

  const isStale = useCallback(
    (id: number, error?: unknown) => id !== counter.current || isAbortError(error),
    [],
  );

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  // A stable object, so consumers can list the whole hook result in an
  // effect dependency array without re-running the effect every render.
  return useMemo(() => ({ begin, isCurrent, isStale }), [begin, isCurrent, isStale]);
}
