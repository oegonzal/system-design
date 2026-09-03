'use client';

import type { EvaluationDto } from '@sysdesign/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, toErrorMessage } from '../../api/client';
import { useLatestRequest } from '../../hooks/use-latest-request';

export const POLL_INTERVAL_MS = 1200;
/** Backoff ceiling while the API cannot be reached — it restarts, the tab does not give up. */
export const POLL_BACKOFF_MAX_MS = 10_000;
/** Consecutive unreachable ticks before the panel says so (one blip stays silent). */
export const UNREACHABLE_AFTER = 3;

export interface EvaluationPollingResult {
  evaluation: EvaluationDto | null;
  /** A TERMINAL problem — the evaluation failed, or cannot exist. Never a transient outage. */
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
  unreachable: boolean,
): string {
  if (error !== null) return `Evaluation problem: ${error}`;
  if (unreachable) return 'Cannot reach the API — retrying…';
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

/** The one HTTP failure that is a fact about the evaluation, not about the connection. */
const isTerminalFailure = (caught: unknown): boolean =>
  caught instanceof ApiError && caught.status === 404;

/**
 * Polls the evaluation for a revision until it reaches a terminal status.
 *
 * A `setTimeout` chain rather than `setInterval`: the next tick is scheduled
 * only after the previous response lands, so a slow API never stacks
 * requests. `useLatestRequest` aborts the in-flight GET when the revision
 * changes or the consumer unmounts, and treats that abort as stale, not as
 * an error.
 *
 * Status-driven, not clock-capped. Only the server knows how long a grade
 * takes — milliseconds on the deterministic stack, minutes under the deep
 * eval — and it already bounds a run itself (a job completes, fails, or is
 * requeued by the reaper). A tab that gave up on its own clock would sit on a
 * stale `running` with Submit disabled while the worker was still grading:
 * the page looks hung when nothing is. So the loop stops on `complete` or
 * `failed`, and an unreachable API (restarting, a dropped connection) backs
 * off and keeps asking rather than stopping — `error`, and the Retry button
 * it drives, are reserved for an evaluation that actually failed. A tab
 * coming back into view re-checks at once instead of waiting out its timer.
 */
export function useEvaluationPolling(revisionId: string | null): EvaluationPollingResult {
  const [evaluation, setEvaluation] = useState<EvaluationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [cycle, setCycle] = useState(0);
  const { begin, isCurrent, isStale } = useLatestRequest();

  useEffect(() => {
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       resetting per-revision state at cycle start is this effect's contract */
    setEvaluation(null);
    setError(null);
    setUnreachable(false);

    if (revisionId === null) {
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
        const next = await api.getEvaluation(revisionId, { signal });
        if (disposed || !isCurrent(id)) return;

        failures = 0;
        setUnreachable(false);
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
        schedule(POLL_INTERVAL_MS);
      } catch (caught) {
        if (disposed || isStale(id, caught)) return;
        if (isTerminalFailure(caught)) {
          setError(toErrorMessage(caught, 'Could not load the evaluation.'));
          setIsPolling(false);
          return;
        }
        // Transient: keep polling with backoff. The evaluation is untouched;
        // only the road to it is out.
        failures += 1;
        if (failures >= UNREACHABLE_AFTER) setUnreachable(true);
        schedule(Math.min(POLL_INTERVAL_MS * 2 ** failures, POLL_BACKOFF_MAX_MS));
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
  }, [revisionId, cycle, begin, isCurrent, isStale]);

  const restart = useCallback(() => setCycle((current) => current + 1), []);

  return {
    evaluation,
    error,
    isPolling,
    message: describe(evaluation, error, isPolling, unreachable),
    restart,
  };
}
