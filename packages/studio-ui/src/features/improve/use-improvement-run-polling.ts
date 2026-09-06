'use client';

import type { ImprovementRunDto } from '@sysdesign/contracts';
import { usePolledResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';

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

const fetchRun = (runId: string, signal: AbortSignal) => api.getImprovementRun(runId, { signal });
const isTerminal = (run: ImprovementRunDto) => TERMINAL.has(run.status);
const terminalError = (run: ImprovementRunDto) =>
  run.status === 'failed' ? (run.error ?? 'The improvement run failed.') : null;

/**
 * Polls an improvement run until it reaches a terminal status —
 * `usePolledResource` with the coach's copy. A subscription run of several
 * iterations outlasts any cap a tab would pick, and the server already bounds
 * a run (max iterations, a hard timeout per call, the reaper).
 */
export function useImprovementRunPolling(runId: string | null): ImprovementRunPollingResult {
  const {
    resource: run,
    error,
    isPolling,
    unreachable,
  } = usePolledResource({
    key: runId,
    fetch: fetchRun,
    isTerminal,
    terminalError,
    intervalMs: IMPROVE_POLL_INTERVAL_MS,
    backoffMaxMs: IMPROVE_POLL_BACKOFF_MAX_MS,
    unreachableAfter: IMPROVE_UNREACHABLE_AFTER,
  });

  return {
    run,
    error,
    isPolling,
    message: describe(run, error, isPolling, unreachable),
    acceptedCount: run?.iterations.filter((iteration) => iteration.accepted).length ?? 0,
  };
}
