'use client';

import type { EvaluationDto } from '@sysdesign/contracts';
import { usePolledResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { formatScore } from './score';

export const POLL_INTERVAL_MS = 1200;
/** Backoff ceiling while the API cannot be reached — it restarts, the tab does not give up. */
export const POLL_BACKOFF_MAX_MS = 10_000;
/** Consecutive unreachable ticks before the panel says so (one blip stays silent). */
export const UNREACHABLE_AFTER = 3;

export interface EvaluationPollingResult {
  evaluation: EvaluationDto | null;
  /** A TERMINAL problem — the run failed, or cannot exist. Never a transient outage. */
  error: string | null;
  isPolling: boolean;
  /** For a LiveRegion — the consumer renders it so announcements have a home. */
  message: string;
  /** Re-run the poll cycle from scratch. */
  restart(): void;
}

function describe(
  evaluation: EvaluationDto | null,
  error: string | null,
  isPolling: boolean,
  unreachable: boolean,
): string {
  if (error !== null) return `Evaluation problem: ${error}`;
  if (unreachable) return 'Cannot reach the API — retrying…';
  if (evaluation === null) return isPolling ? 'Checking evaluation status…' : '';
  switch (evaluation.status) {
    case 'running':
      return 'Evaluation running…';
    case 'complete': {
      const score = evaluation.overall !== null ? ` — ${formatScore(evaluation.overall)}/100` : '';
      const decision = evaluation.decision ? ` · ${evaluation.decision}` : '';
      return `Evaluation complete${score}${decision}.`;
    }
    case 'failed':
      return 'Evaluation failed.';
  }
}

const fetchEvaluation = (revisionId: string, signal: AbortSignal) =>
  api.getEvaluation(revisionId, { signal });
const isTerminal = (evaluation: EvaluationDto) =>
  evaluation.status === 'complete' || evaluation.status === 'failed';
const terminalError = (evaluation: EvaluationDto) =>
  evaluation.status === 'failed' ? (evaluation.error ?? 'Evaluation failed.') : null;

/**
 * Polls the grade for a revision until the run reaches a terminal status —
 * `usePolledResource` with this domain's copy. Status-driven, not
 * clock-capped: only the quality loop knows how long its lenses take, and
 * `error` (with the resubmit button it drives) is reserved for a run that
 * actually failed, never for an unreachable API.
 */
export function useEvaluationPolling(revisionId: string | null): EvaluationPollingResult {
  const {
    resource: evaluation,
    error,
    isPolling,
    unreachable,
    restart,
  } = usePolledResource({
    key: revisionId,
    fetch: fetchEvaluation,
    isTerminal,
    terminalError,
    intervalMs: POLL_INTERVAL_MS,
    backoffMaxMs: POLL_BACKOFF_MAX_MS,
    unreachableAfter: UNREACHABLE_AFTER,
  });

  return {
    evaluation,
    error,
    isPolling,
    message: describe(evaluation, error, isPolling, unreachable),
    restart,
  };
}
