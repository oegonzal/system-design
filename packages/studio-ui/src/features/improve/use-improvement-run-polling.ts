'use client';

import type { ImprovementRunDto } from '@sysdesign/contracts';
import { useEffect, useState } from 'react';

import { api, ApiError, toErrorMessage } from '../../api/client';
import { useLatestRequest } from '../../hooks/use-latest-request';

export const IMPROVE_POLL_INTERVAL_MS = 1500;
/** Backoff ceiling while the API cannot be reached — it restarts, the tab does not give up. */
export const IMPROVE_POLL_BACKOFF_MAX_MS = 10_000;
/** Consecutive unreachable ticks before the panel says so. */
export const IMPROVE_UNREACHABLE_AFTER = 3;

export interface ImprovementRunPollingResult {
  run: ImprovementRunDto | null;
  error: string | null;
  isPolling: boolean;
  /** For a LiveRegion — the consumer renders it so announcements have a home. */
  message: string;
  /** Accepted iterations so far — the workspace refreshes the timeline when this grows. */
  acceptedCount: number;
}

const TERMINAL = new Set<ImprovementRunDto['status']>(['completed', 'failed', 'cancelled']);

function describe(
  run: ImprovementRunDto | null,
  error: string | null,
  isPolling: boolean,
  unreachable: boolean,
): string {
  if (error !== null) return `Coach problem: ${error}`;
  if (unreachable) return 'Cannot reach the API — retrying…';
  if (run === null) return isPolling ? 'Checking the coach…' : '';
  const last = run.iterations[run.iterations.length - 1];
  switch (run.status) {
    case 'queued':
      return 'Coach queued.';
    case 'running':
      return last
        ? `Coach iteration ${last.iteration} of ${run.maxIterations} — score ${last.score}.`
        : 'Coach starting…';
    case 'completed': {
      const accepted = run.iterations.filter((iteration) => iteration.accepted);
      const best = accepted[accepted.length - 1];
      return `Coach finished${best ? ` — best score ${best.score}` : ''}.`;
    }
    case 'failed':
      return 'Coach failed.';
    case 'cancelled':
      return 'Coach cancelled.';
  }
}

/** The one HTTP failure that is a fact about the run, not about the connection. */
const isTerminalFailure = (caught: unknown): boolean =>
  caught instanceof ApiError && caught.status === 404;

/**
 * Polls an improvement run until it reaches a terminal status — the
 * `useEvaluationPolling` discipline: a `setTimeout` chain (never stacks
 * requests), `useLatestRequest` abort-as-stale on unmount/run change, and
 * status-driven rather than clock-capped: a subscription run of several
 * iterations outlasts any cap a tab would pick, and the server already bounds
 * a run (max iterations, a hard timeout per call, the reaper). An unreachable
 * API backs off and keeps asking; `error` is reserved for a run that failed.
 */
export function useImprovementRunPolling(runId: string | null): ImprovementRunPollingResult {
  const [run, setRun] = useState<ImprovementRunDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const { begin, isCurrent, isStale } = useLatestRequest();

  useEffect(() => {
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       resetting per-run state at cycle start is this effect's contract */
    setRun(null);
    setError(null);
    setUnreachable(false);

    if (runId === null) {
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
        const next = await api.getImprovementRun(runId, { signal });
        if (disposed || !isCurrent(id)) return;

        failures = 0;
        setUnreachable(false);
        setRun(next);

        if (TERMINAL.has(next.status)) {
          if (next.status === 'failed') setError(next.error ?? 'The improvement run failed.');
          setIsPolling(false);
          return;
        }
        schedule(IMPROVE_POLL_INTERVAL_MS);
      } catch (caught) {
        if (disposed || isStale(id, caught)) return;
        if (isTerminalFailure(caught)) {
          setError(toErrorMessage(caught, 'Could not load the improvement run.'));
          setIsPolling(false);
          return;
        }
        failures += 1;
        if (failures >= IMPROVE_UNREACHABLE_AFTER) setUnreachable(true);
        schedule(Math.min(IMPROVE_POLL_INTERVAL_MS * 2 ** failures, IMPROVE_POLL_BACKOFF_MAX_MS));
      }
    };

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
  }, [runId, begin, isCurrent, isStale]);

  return {
    run,
    error,
    isPolling,
    message: describe(run, error, isPolling, unreachable),
    acceptedCount: run?.iterations.filter((iteration) => iteration.accepted).length ?? 0,
  };
}
