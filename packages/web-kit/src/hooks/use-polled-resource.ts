'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../http/request';
import { useLatestRequest } from './use-latest-request';

export const DEFAULT_POLL_INTERVAL_MS = 1200;
/** Backoff ceiling while the API cannot be reached — it restarts, the tab does not give up. */
export const DEFAULT_POLL_BACKOFF_MAX_MS = 10_000;
/** Consecutive unreachable ticks before the consumer is told (one blip stays silent). */
export const DEFAULT_UNREACHABLE_AFTER = 3;

export interface PolledResourceOptions<T> {
  /** What to poll; `null` idles the hook — no fetch, state reset. */
  key: string | null;
  /** One GET. The signal aborts when the key changes, the cycle restarts, or the consumer unmounts. */
  fetch: (key: string, signal: AbortSignal) => Promise<T>;
  /** True once the resource reached a final status — polling stops. */
  isTerminal: (resource: T) => boolean;
  /** Copy for `error` when the terminal resource is itself a failure; `null` for a clean finish. */
  terminalError?: (resource: T) => string | null;
  intervalMs?: number;
  backoffMaxMs?: number;
  unreachableAfter?: number;
}

export interface PolledResource<T> {
  resource: T | null;
  /** A TERMINAL problem — the resource failed, or cannot exist. Never a transient outage. */
  error: string | null;
  isPolling: boolean;
  /** `unreachableAfter` consecutive transient failures and counting; clears on the next success. */
  unreachable: boolean;
  /** Re-run the poll cycle from scratch for the same key. */
  restart(): void;
}

/** The one HTTP failure that is a fact about the resource, not about the connection. */
const isTerminalFailure = (caught: unknown): caught is ApiError =>
  caught instanceof ApiError && caught.status === 404;

/**
 * Polls a resource until its own status says it is terminal.
 *
 * A `setTimeout` chain rather than `setInterval`: the next tick is scheduled
 * only after the previous response lands, so a slow API never stacks
 * requests. `useLatestRequest` aborts the in-flight GET when the key changes
 * or the consumer unmounts, and treats that abort as stale, not as an error.
 *
 * Status-driven, not clock-capped. Only the server knows how long the work
 * takes — milliseconds on a deterministic stack, minutes under a model — and
 * it already bounds a run itself. A tab that gave up on its own clock would
 * sit on a stale `running` while the server was still working: the page
 * looks hung when nothing is. So the loop stops only on a terminal resource,
 * and an unreachable API (restarting, a dropped connection) backs off and
 * keeps asking rather than stopping — `error` is reserved for a resource that
 * actually failed, or a 404. A tab coming back into view re-checks at once
 * instead of waiting out its timer.
 */
export function usePolledResource<T>(options: PolledResourceOptions<T>): PolledResource<T> {
  const {
    key,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    backoffMaxMs = DEFAULT_POLL_BACKOFF_MAX_MS,
    unreachableAfter = DEFAULT_UNREACHABLE_AFTER,
  } = options;
  const [resource, setResource] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [cycle, setCycle] = useState(0);
  const { begin, isCurrent, isStale } = useLatestRequest();

  // Callbacks are read through a ref so consumers may pass inline lambdas
  // without restarting the cycle on every render. Declared before the polling
  // effect so it is refreshed first in every commit.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       resetting per-key state at cycle start is this effect's contract */
    setResource(null);
    setError(null);
    setUnreachable(false);

    if (key === null) {
      setIsPolling(false);
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    setIsPolling(true);
    /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

    const schedule = (ms: number) => {
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      const { id, signal } = begin();
      try {
        const next = await latest.current.fetch(key, signal);
        if (disposed || !isCurrent(id)) return;

        failures = 0;
        setUnreachable(false);
        setResource(next);

        if (latest.current.isTerminal(next)) {
          const problem = latest.current.terminalError?.(next) ?? null;
          if (problem !== null) setError(problem);
          setIsPolling(false);
          return;
        }
        schedule(intervalMs);
      } catch (caught) {
        if (disposed || isStale(id, caught)) return;
        if (isTerminalFailure(caught)) {
          setError(caught.message);
          setIsPolling(false);
          return;
        }
        // Transient: keep polling with backoff. The resource is untouched;
        // only the road to it is out.
        failures += 1;
        if (failures >= unreachableAfter) setUnreachable(true);
        schedule(Math.min(intervalMs * 2 ** failures, backoffMaxMs));
      }
    };

    // Back in view after a while away: ask now, do not wait out the timer.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    void tick();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [key, cycle, intervalMs, backoffMaxMs, unreachableAfter, begin, isCurrent, isStale]);

  const restart = useCallback(() => setCycle((current) => current + 1), []);

  return { resource, error, isPolling, unreachable, restart };
}
