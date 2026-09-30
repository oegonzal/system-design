'use client';

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { toErrorMessage } from '../http/request';
import { useLatestRequest } from './use-latest-request';

export interface Resource<T> {
  /** The last successful load; kept while a reload is in flight. */
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Load again, now — after a write the page made, say. */
  reload(): void;
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
): Resource<T> {
  const latest = useLatestRequest();
  const loader = useRef(load);
  loader.current = load;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const { id, signal } = latest.begin();
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       marking the load in flight at its start is this effect's contract */
    setLoading(true);
    setError(null);
    /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
    loader
      .current(signal)
      .then((result) => {
        if (latest.isStale(id)) return;
        setData(result);
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (latest.isStale(id, failure)) return;
        setError(toErrorMessage(failure, 'the request failed'));
        setLoading(false);
      });
  }, [latest, generation, ...deps]);

  const reload = useCallback(() => setGeneration((current) => current + 1), []);

  return { data, error, loading, reload };
}
