'use client';

import type { ImproveRunDto } from '@sysdesign/contracts';
import { usePolledResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { formatScore } from '../evaluation/score';
import { coachProgress } from './coach-progress';

export const IMPROVE_POLL_INTERVAL_MS = 1500;
/** Backoff ceiling while the API cannot be reached — it restarts, the tab does not give up. */
export const IMPROVE_POLL_BACKOFF_MAX_MS = 10_000;
/** Consecutive unreachable ticks before the panel says so. */
export const IMPROVE_UNREACHABLE_AFTER = 3;

export interface ImproveRunPollingResult {
  run: ImproveRunDto | null;
  /** A failed run's own error, verbatim — the operator's line; the announcement says it in the author's words. */
  error: string | null;
  isPolling: boolean;
  /** For a LiveRegion — the consumer renders it so announcements have a home. */
  message: string;
  /** Iterations imported as revisions so far — the workspace refreshes the timeline when this grows. */
  acceptedCount: number;
}

function describe(
  run: ImproveRunDto | null,
  error: string | null,
  isPolling: boolean,
  unreachable: boolean,
): string {
  if (error !== null) return 'The coach stopped unexpectedly.';
  if (unreachable) return 'Cannot reach the API — retrying…';
  if (run === null) return isPolling ? 'Checking the coach…' : '';
  switch (run.status) {
    case 'running':
      return `${coachProgress(run)}.`;
    case 'complete': {
      const scores = run.iterations
        .map((iteration) => iteration.overall)
        .filter((overall): overall is number => overall !== null);
      return `Coach finished${scores.length > 0 ? ` — best score ${formatScore(Math.max(...scores))}` : ''}.`;
    }
    case 'failed':
      return 'The coach stopped unexpectedly.';
  }
}

const isTerminal = (run: ImproveRunDto) => run.status === 'complete' || run.status === 'failed';
const terminalError = (run: ImproveRunDto) =>
  run.status === 'failed' ? (run.error ?? 'The coach run failed.') : null;

/**
 * Polls a coach run until it reaches a terminal status — `usePolledResource`
 * with the coach's copy. Every poll lets the API import the iterations that
 * beat their predecessors, so the timeline can be refreshed as `acceptedCount`
 * grows rather than minutes later at run end.
 */
export function useImproveRunPolling(
  sessionId: string,
  runId: string | null,
): ImproveRunPollingResult {
  const {
    resource: run,
    error,
    isPolling,
    unreachable,
  } = usePolledResource({
    key: runId,
    fetch: (key, signal) => api.getImprove(sessionId, key, { signal }),
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
    acceptedCount:
      run?.iterations.filter((iteration) => iteration.outcome === 'imported').length ?? 0,
  };
}
