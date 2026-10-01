'use client';

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { toErrorMessage, UNREACHABLE_COPY } from '../http/request';
import { useLatestRequest } from './use-latest-request';

export interface Resource<T> {
  /** The last successful load; kept while a reload is in flight. */
  data: T | null;
  /** The last load's failure as copy a person can read; null while it did not fail. */
  error: string | null;
  /** What the last load threw, for a caller that classifies it (`readFailureOf`); null while it did not fail. */
  failure: unknown;
  loading: boolean;
  /** Load again, now — after a write the page made, say. */
  reload(): void;
  /** Take the resource as a write answered it, without reading it again. */
  replace(next: T): void;
}

export interface ResourceOptions {
  /** The copy for a failure the server did not word itself — a dropped connection. */
  fallback?: string;
}

/**
 * One read resource of a page: loaded when `deps` change, last-write-wins,
 * aborted on unmount. A superseded response never paints; an abort is never
 * an error. `load` receives the signal to pass to the request and is read
 * through a ref, so a consumer may pass an inline lambda — `deps` say when
 * the resource changed.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  { fallback = UNREACHABLE_COPY }: ResourceOptions = {},
): Resource<T> {
  const latest = useLatestRequest();
  const loader = useRef(load);
  loader.current = load;
  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<{ cause: unknown; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const { id, signal } = latest.begin();
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       marking the load in flight at its start is this effect's contract */
    setLoading(true);
    setFailure(null);
    /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
    loader
      .current(signal)
      .then((result) => {
        if (latest.isStale(id)) return;
        setData(result);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (latest.isStale(id, caught)) return;
        setFailure({ cause: caught, message: toErrorMessage(caught, fallback) });
        setLoading(false);
      });
  }, [latest, generation, ...deps]);

  const reload = useCallback(() => setGeneration((current) => current + 1), []);
  const replace = useCallback((next: T) => setData(next), []);

  return {
    data,
    error: failure?.message ?? null,
    failure: failure?.cause ?? null,
    loading,
    reload,
    replace,
  };
}
