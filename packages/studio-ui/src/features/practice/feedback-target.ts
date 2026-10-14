import type {
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  RevisionEvaluationRef,
  RevisionOrigin,
  SessionInFlightDto,
} from '@sysdesign/contracts';

/** The revision whose grade the feedback tab shows; `evaluation` null means it has none to poll. */
export interface FeedbackTarget {
  id: string;
  revisionNumber: number;
  origin: RevisionOrigin;
  evaluation: RevisionEvaluationRef | null;
  /** When its grade started: when it was stored, or when this tab sent it to be graded again. */
  gradingSince: string;
}

/** A revision as the feedback tab's subject; its grade started when it was stored unless said otherwise. */
export const toTarget = (
  revision: DesignRevisionSummaryDto | DesignRevisionDto,
  gradingSince: string = revision.createdAt,
): FeedbackTarget => ({
  id: revision.id,
  revisionNumber: revision.revisionNumber,
  origin: revision.origin,
  evaluation: revision.evaluation,
  gradingSince,
});

/** The run a fresh submission's grade holds the session's slot with — running, since it just started. */
export const gradeSlot = (revision: DesignRevisionDto): SessionInFlightDto | null =>
  revision.evaluation === null
    ? null
    : {
        kind: 'grade',
        runId: revision.evaluation.runId,
        revisionNumber: revision.revisionNumber,
        state: 'running',
      };

export function toSummary(revision: DesignRevisionDto): DesignRevisionSummaryDto {
  return {
    id: revision.id,
    revisionNumber: revision.revisionNumber,
    origin: revision.origin,
    evaluation: revision.evaluation,
    createdAt: revision.createdAt,
  };
}

export const byNewest = (a: DesignRevisionSummaryDto, b: DesignRevisionSummaryDto) =>
  b.revisionNumber - a.revisionNumber;

/** The newest revision the author submitted — what Submit and the toolbar's grade badge are about. */
export const latestUserRevision = (
  revisions: readonly DesignRevisionSummaryDto[],
): DesignRevisionSummaryDto | null =>
  revisions.find((candidate) => candidate.origin === 'user') ?? null;
