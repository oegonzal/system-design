'use client';

import type { ApiListResponse } from '@sysdesign/contracts';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { toErrorMessage } from '../http/request';
import { useLatestRequest } from './use-latest-request';

/** One page of a list: how many rows, from where. */
export interface PageRequest {
  limit: number;
  offset: number;
}

export interface PagedList<T> {
  /**
   * Every row loaded so far for the current query. Null until its first page
   * lands — and again when that page failed, so a list never shows rows
   * from a query it no longer answers.
   */
  items: T[] | null;
  /** How many rows the server holds for the current query. */
  total: number;
  /** True while the first page of the current query is in flight. */
  loading: boolean;
  /** True while a further page is in flight. */
  loadingMore: boolean;
  /** Why the last page failed, as copy a person can read; null while it did not. */
  error: string | null;
  /** Rows exist past the ones loaded. */
  hasMore: boolean;
  /** Fetch the next page and append it — also how a failed further page is tried again. */
  loadMore(): void;
  /** Start over from the first page. */
  reload(): void;
}

export interface PagedListOptions {
  pageSize: number;
  /** The copy for a failure the server did not word itself — a dropped connection. */
  fallback: string;
}

/**
 * A server-paged list a page reads a page at a time: the first page when
 * `deps` change, the next on `loadMore`, last-write-wins throughout. While
 * a new query's first page is in flight the previous rows stay up (the
 * caller marks them busy); if it fails they go, and the error stands in
 * their place. A failed further page keeps the rows already shown.
 */
export function usePagedList<T>(
  load: (page: PageRequest, signal: AbortSignal) => Promise<ApiListResponse<T>>,
  deps: DependencyList,
  { pageSize, fallback }: PagedListOptions,
): PagedList<T> {
  const latest = useLatestRequest();
  const loader = useRef(load);
  loader.current = load;
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState<'first' | 'more' | null>('first');
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const fetchPage = useCallback(
    (offset: number) => {
      const { id, signal } = latest.begin();
      const first = offset === 0;
      /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
         reached from the query effect on purpose: a changed query asks for its
         first page, and marking that page in flight is this hook's contract */
      setPending(first ? 'first' : 'more');
      setError(null);
      loader
        .current({ limit: pageSize, offset }, signal)
        .then((response) => {
          if (latest.isStale(id)) return;
          setItems((current) => (first ? response.data : [...(current ?? []), ...response.data]));
          setTotal(response.meta.total);
          setPending(null);
        })
        .catch((caught: unknown) => {
          if (latest.isStale(id, caught)) return;
          if (first) {
            setItems(null);
            setTotal(0);
          }
          setError(toErrorMessage(caught, fallback));
          setPending(null);
        });
      /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
    },
    [latest, pageSize, fallback],
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage, generation, ...deps]);

  const loaded = items?.length ?? 0;
  const loadMore = useCallback(() => fetchPage(loaded), [fetchPage, loaded]);
  const reload = useCallback(() => setGeneration((current) => current + 1), []);

  return {
    items,
    total,
    loading: pending === 'first',
    loadingMore: pending === 'more',
    error,
    hasMore: items !== null && loaded < total,
    loadMore,
    reload,
  };
}
