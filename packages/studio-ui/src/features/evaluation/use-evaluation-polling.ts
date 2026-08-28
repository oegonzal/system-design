'use client';

import type { EvaluationDto } from '@sysdesign/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';
import { useLatestRequest } from '../../hooks/use-latest-request';

export const POLL_INTERVAL_MS = 1200;
export const POLL_CAP_MS = 90_000;

export interface EvaluationPollingResult {
  evaluation: EvaluationDto | null;
  error: string | null;
  isPolling: boolean;
  /** For a LiveRegion — the consumer renders it so announcements have a home. */
  message: string;
  /** Re-run the poll cycle from scratch (after a retry POST). */
  restart(): void;
}

function describe(
  evaluation: EvaluationDto | null,
  error: string | null,
  isPolling: boolean,
): string {
  if (error !== null) return `Evaluation problem: ${error}`;
  if (evaluation === null) return isPolling ? 'Checking evaluation status…' : '';
  switch (evaluation.status) {
    case 'queued':
      return 'Evaluation queued.';
    case 'running':
      return 'Evaluation running…';
    case 'complete':
      return `Evaluation complete${evaluation.grade ? ` — grade ${evaluation.grade}` : ''}.`;
    case 'failed':
      return 'Evaluation failed.';
  }
}

/**
 * Polls the evaluation for a revision until it reaches a terminal status.
 *
 * A `setTimeout` chain rather than `setInterval`: the next tick is scheduled
 * only after the previous response lands, so a slow API never stacks
 * requests. `useLatestRequest` aborts the in-flight GET when the revision
 * changes or the consumer unmounts, and treats that abort as stale, not as
 * an error. A ~90s cap turns a stuck queue into an explicit timeout.
 */
export function useEvaluationPolling(revisionId: string | null): EvaluationPollingResult {
  const [evaluation, setEvaluation] = useState<EvaluationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [cycle, setCycle] = useState(0);
  const { begin, isCurrent, isStale } = useLatestRequest();

  useEffect(() => {
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       resetting per-revision state at cycle start is this effect's contract */
    setEvaluation(null);
    setError(null);

    if (revisionId === null) {
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
        const next = await api.getEvaluation(revisionId, { signal });
        if (disposed || !isCurrent(id)) return;

        setEvaluation(next);

        if (next.status === 'complete') {
          setIsPolling(false);
          return;
        }
        if (next.status === 'failed') {
          setError(next.error ?? 'Evaluation failed.');
          setIsPolling(false);
          return;
        }
        if (Date.now() - startedAt >= POLL_CAP_MS) {
          setError('Evaluation timed out. Retry when the worker is back.');
          setIsPolling(false);
          return;
        }
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      } catch (caught) {
        if (disposed || isStale(id, caught)) return;
        setError(toErrorMessage(caught, 'Could not load the evaluation.'));
        setIsPolling(false);
      }
    };

    void tick();

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [revisionId, cycle, begin, isCurrent, isStale]);

  const restart = useCallback(() => setCycle((current) => current + 1), []);

  return {
    evaluation,
    error,
    isPolling,
    message: describe(evaluation, error, isPolling),
    restart,
  };
}
