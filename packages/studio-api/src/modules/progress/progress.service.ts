import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { CanvasCriterionKind, ProgressDto } from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { aggregateCompetencies, weakestKind, type GradedRevision } from './competency-aggregate';

/**
 * The author's standing per competency, read from the verdicts the loop
 * recorded on their own revisions: every revision of origin `user` that was
 * handed to the loop names the run and iteration it was graded under, and
 * the loop answers in one call which of those it recorded and how each
 * criterion settled — the cached status on the revision is not consulted, so
 * a grade nobody read back still counts. The studio counts; it never grades,
 * weighs or rescales (DEL-4). Coach revisions are not the author's work and
 * are left out.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
  ) {}

  async progress(): Promise<ProgressDto> {
    const revisions = await this.em.find(
      DesignRevision,
      { origin: 'user', qualityRunId: { $ne: null } },
      { orderBy: { createdAt: 'asc' } },
    );
    const refs = revisions.flatMap((revision) =>
      revision.qualityRunId !== null && revision.qualityIteration !== null
        ? [{ runId: revision.qualityRunId, iteration: revision.qualityIteration }]
        : [],
    );
    const evidence = refs.length === 0 ? [] : await this.loop.iterationEvidence(refs);
    const byRef = new Map(evidence.map((item) => [`${item.runId}#${item.iteration}`, item]));
    const graded: GradedRevision[] = revisions.flatMap((revision) => {
      const item = byRef.get(`${revision.qualityRunId}#${revision.qualityIteration}`);
      return item === undefined
        ? []
        : [
            {
              sessionId: revision.session.id,
              gradedAt: item.finishedAt ?? revision.createdAt.toISOString(),
              criteria: item.criteria.map(({ kind, result }) => ({ kind, result })),
            },
          ];
    });
    return {
      competencies: aggregateCompetencies(graded),
      sessions: new Set(graded.map((revision) => revision.sessionId)).size,
    };
  }

  /** The competency to practise next, or null while too little has been graded to say. */
  async weakestKind(): Promise<CanvasCriterionKind | null> {
    return weakestKind((await this.progress()).competencies);
  }
}
