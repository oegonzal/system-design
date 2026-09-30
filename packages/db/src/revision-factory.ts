import type { EntityManager } from '@mikro-orm/postgresql';
import type * as Contracts from '@sysdesign/contracts';

import { DesignRevision } from './entities/design-revision.entity';

/** The iteration of the quality-loop run that grades the revision. */
export interface RevisionRun {
  runId: string;
  iteration: number;
}

/**
 * The one way a revision comes into being, shared by everything that persists
 * one: a submission, the coach's base revision, and every coach iteration the
 * studio imports. Dense numbering (max + 1) and the run pointer are written
 * together — run this inside a transaction, and let the unique
 * (session, revision_number) and (quality_run_id, quality_iteration)
 * constraints arbitrate concurrent writers (retry or skip on violation).
 *
 * The cache starts `running`; an import of a finished iteration overwrites it
 * with the terminal values before flushing.
 */
export function createRevision(
  em: EntityManager,
  sessionId: string,
  submission: Contracts.DesignSubmission,
  origin: Contracts.RevisionOrigin,
  run: RevisionRun,
): Promise<DesignRevision> {
  return em
    .findOne(DesignRevision, { session: sessionId }, { orderBy: { revisionNumber: 'desc' } })
    .then((latest) => {
      const revision = em.create(DesignRevision, {
        session: sessionId,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        origin,
        graph: submission.graph,
        brief: submission.brief,
        narrative: submission.narrative,
        qualityRunId: run.runId,
        qualityIteration: run.iteration,
        evaluationStatus: 'running',
      });
      em.persist(revision);
      return revision;
    });
}
