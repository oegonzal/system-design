'use client';

import type { EvaluationDto } from '@sysdesign/contracts';
import { usePolledResource, type ApiError } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { goneRead, isMissing, readOrMissing, type ReadOutcome } from './missing-read';
import { formatScore } from './score';

export const POLL_INTERVAL_MS = 1200;
/** Backoff ceiling while the API cannot be reached — it restarts, the tab does not give up. */
export const POLL_BACKOFF_MAX_MS = 10_000;
/** Consecutive unreachable ticks before the panel says so (one blip stays silent). */
export const UNREACHABLE_AFTER = 3;

export interface EvaluationPollingResult {
  evaluation: EvaluationDto | null;
  /**
   * A TERMINAL problem — the run failed, or cannot exist. Never a transient
   * outage. The run's own error, verbatim: the operator's line, which the
   * announcement and the panel put in the author's words.
   */
  error: string | null;
  /**
   * The revision — or its whole session — no longer exists: the 404 that said
   * so. The page's subject went with it; nothing here is left to show.
   */
  gone: ApiError | null;
  /**
   * The revision is there, but the studio can read no grade for it — the
   * grader no longer has its run. Nothing failed, and nothing is running:
   * there is only a revision to grade again.
   */
  lost: boolean;
  isPolling: boolean;
  /** For a LiveRegion — the consumer renders it so announcements have a home. */
  message: string;
  /** Re-run the poll cycle from scratch. */
  restart(): void;
}

function describe(
  evaluation: EvaluationDto | null,
  error: string | null,
  lost: boolean,
  isPolling: boolean,
  unreachable: boolean,
): string {
  if (error !== null) return 'Grading stopped unexpectedly.';
  if (lost) return 'This revision has no grade to show.';
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
      return 'Grading stopped unexpectedly.';
  }
}

type GradeRead = ReadOutcome<EvaluationDto>;

// A 404 is an answer about the grade, not a failed poll: what is missing —
// the revision, or only its grade — decides what the page does next.
const fetchEvaluation = (revisionId: string, signal: AbortSignal) =>
  readOrMissing(api.getEvaluation(revisionId, { signal }));
// The run, not the iteration: a grade recorded while its run goes on still
// waits for the stop reason only the run's end can give it.
const isTerminal = (read: GradeRead) => isMissing(read) || read.found.settled;
const terminalError = (read: GradeRead) =>
  !isMissing(read) && read.found.status === 'failed'
    ? (read.found.error ?? 'The grading run failed.')
    : null;

/**
 * Polls the grade for a revision until its run settles — `usePolledResource`
 * with this domain's copy. Settled-driven, not
 * clock-capped: only the quality loop knows how long its lenses take, and
 * `error` (with the grade-again button it drives) is reserved for a run that
 * actually failed, never for an unreachable API. A grade that is not there
 * is neither: the revision is `gone`, or its grade is `lost`.
 */
export function useEvaluationPolling(revisionId: string | null): EvaluationPollingResult {
  const {
    resource: read,
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

  const evaluation = read !== null && !isMissing(read) ? read.found : null;
  const gone = goneRead(read);
  const lost = read !== null && isMissing(read) && gone === null;

  return {
    evaluation,
    error,
    gone,
    lost,
    isPolling,
    message: describe(evaluation, error, lost, isPolling, unreachable),
    restart,
  };
}
