import type {
  CoachingRunSummaryDto,
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  RevisionEvaluationRef,
} from '@sysdesign/contracts';
import type { CoachingRun, DesignRevision, DesignSession } from '@sysdesign/db';

/** A session plus the newest revision its DTO summarises. */
export interface SessionWithLatest {
  session: DesignSession;
  latestRevision: DesignRevision | null;
}

/** Where the grade lives, from the row's own pointer and cache; null for a revision graded before delegation. */
export const toEvaluationRef = (r: DesignRevision): RevisionEvaluationRef | null =>
  r.qualityRunId === null || r.qualityIteration === null
    ? null
    : {
        runId: r.qualityRunId,
        iteration: r.qualityIteration,
        status: r.evaluationStatus ?? 'running',
        overall: r.overall,
        decision: r.decision,
      };

/** Full revision, graph included. */
export const toRevisionDto = (r: DesignRevision): DesignRevisionDto => ({
  id: r.id,
  sessionId: r.session.id,
  revisionNumber: r.revisionNumber,
  origin: r.origin,
  graph: r.graph,
  brief: r.brief,
  narrative: r.narrative,
  evaluation: toEvaluationRef(r),
  createdAt: r.createdAt.toISOString(),
});

/** List projection: the header and the grade, never the design itself. */
export const toRevisionSummaryDto = (r: DesignRevision): DesignRevisionSummaryDto => ({
  id: r.id,
  revisionNumber: r.revisionNumber,
  origin: r.origin,
  evaluation: toEvaluationRef(r),
  createdAt: r.createdAt.toISOString(),
});

export const toCoachingRunSummaryDto = (run: CoachingRun): CoachingRunSummaryDto => ({
  runId: run.runId,
  baseRevisionId: run.baseRevision.id,
  maxIterations: run.maxIterations,
  startedAt: run.startedAt.toISOString(),
});

export const toSessionDto = ({ session, latestRevision }: SessionWithLatest): DesignSessionDto => ({
  id: session.id,
  promptId: session.prompt.id,
  status: session.status,
  revisionCount: session.revisions.count(),
  latestRevisionNumber: latestRevision?.revisionNumber ?? null,
  latestOverall: latestRevision?.overall ?? null,
  latestDecision: latestRevision?.decision ?? null,
  latestEvaluationStatus: latestRevision?.evaluationStatus ?? null,
  draft: session.draft,
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString(),
});
