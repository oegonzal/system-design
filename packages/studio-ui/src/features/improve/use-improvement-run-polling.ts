'use client';

import type { ImprovementRunDto } from '@sysdesign/contracts';
import { useEffect, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';
import { useLatestRequest } from '../../hooks/use-latest-request';

export const IMPROVE_POLL_INTERVAL_MS = 1500;
/** Runs make one model call per iteration — minutes, not the eval's seconds. */
export const IMPROVE_POLL_CAP_MS = 10 * 60_000;

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

function describe(run: ImprovementRunDto | null, error: string | null, isPolling: boolean): string {
  if (error !== null) return `Coach problem: ${error}`;
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

/**
 * Polls an improvement run until it reaches a terminal status — the
 * `useEvaluationPolling` discipline: a `setTimeout` chain (never stacks
 * requests), `useLatestRequest` abort-as-stale on unmount/run change, and a
 * cap that turns a stuck queue into an explicit timeout.
 */
export function useImprovementRunPolling(runId: string | null): ImprovementRunPollingResult {
  const [run, setRun] = useState<ImprovementRunDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const { begin, isCurrent, isStale } = useLatestRequest();

  useEffect(() => {
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       resetting per-run state at cycle start is this effect's contract */
    setRun(null);
    setError(null);

    if (runId === null) {
      setIsPolling(false);
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    setIsPolling(true);
    /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

    const tick = async () => {
      const { id, signal } = begin();
      try {
        const next = await api.getImprovementRun(runId, { signal });
        if (disposed || !isCurrent(id)) return;

        setRun(next);

        if (TERMINAL.has(next.status)) {
          if (next.status === 'failed') setError(next.error ?? 'The improvement run failed.');
          setIsPolling(false);
          return;
        }
        if (Date.now() - startedAt >= IMPROVE_POLL_CAP_MS) {
          setError('The coach timed out. Check the worker and start another run.');
          setIsPolling(false);
          return;
        }
        timer = setTimeout(() => void tick(), IMPROVE_POLL_INTERVAL_MS);
      } catch (caught) {
        if (disposed || isStale(id, caught)) return;
        setError(toErrorMessage(caught, 'Could not load the improvement run.'));
        setIsPolling(false);
      }
    };

    void tick();

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [runId, begin, isCurrent, isStale]);

  return {
    run,
    error,
    isPolling,
    message: describe(run, error, isPolling),
    acceptedCount: run?.iterations.filter((iteration) => iteration.accepted).length ?? 0,
  };
}
