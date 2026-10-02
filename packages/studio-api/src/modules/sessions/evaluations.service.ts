import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { describeLostGrade, type EvaluationDto } from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { toEvaluationDto } from './evaluation.mapper';

/**
 * A revision's grade, read from the loop. The row caches the terminal
 * scalars on the way through, so lists and timelines answer without the
 * loop; the findings and criterion results are always the loop's, live. A
 * read that finds nothing says which thing is missing: the `revision` — the
 * same 404 a read of the revision itself gives — or its `evaluation`.
 */
@Injectable()
export class EvaluationsService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
  ) {}

  async forRevision(revisionId: string): Promise<EvaluationDto> {
    const revision = await this.em.findOne(DesignRevision, revisionId);
    if (!revision) throw notFound('revision', `Revision ${revisionId} not found`);
    // The revision is there and its grade is not: both ways say `evaluation`,
    // and both are cured the same way — the revision is graded again in place.
    if (revision.qualityRunId === null || revision.qualityIteration === null) {
      throw notFound(
        'evaluation',
        `Revision #${revision.revisionNumber} was stored before grading moved to the quality loop and has no evaluation`,
      );
    }
    const evaluation = await this.syncRevision(revision);
    if (evaluation === null) {
      throw notFound('evaluation', describeLostGrade(revision.revisionNumber));
    }
    return evaluation;
  }

  /**
   * Read the revision's run, map it, and write the terminal cache back when
   * it differs — the one place the cache is refreshed, shared with whoever
   * must know whether a grade is still in flight before acting on it. Null
   * when the loop does not have the run — it never recorded it, or its store
   * lost it: there is no grade to read, and no run to wait on. Each caller
   * says what that means to it. A grade still awaited is then recorded as
   * failed, with why in the author's terms, so nothing reads "grading…" for a
   * run nothing is running; a grade already terminal keeps what it had.
   */
  async syncRevision(
    revision: DesignRevision,
    em: EntityManager = this.em,
  ): Promise<EvaluationDto | null> {
    if (revision.qualityRunId === null || revision.qualityIteration === null) {
      throw notFound('evaluation', `Revision #${revision.revisionNumber} has no evaluation`);
    }
    const run = await this.loop.getRun(revision.qualityRunId);
    if (!run) {
      if (revision.evaluationStatus === null || revision.evaluationStatus === 'running') {
        revision.evaluationStatus = 'failed';
        revision.overall = null;
        revision.decision = null;
        revision.evaluationError = describeLostGrade(revision.revisionNumber);
        await em.flush();
      }
      return null;
    }

    const dto = toEvaluationDto(run, revision.qualityIteration, {
      graph: revision.graph,
      brief: revision.brief,
      narrative: revision.narrative,
    });
    if (
      dto.status !== 'running' &&
      (revision.evaluationStatus !== dto.status ||
        revision.overall !== dto.overall ||
        revision.decision !== dto.decision)
    ) {
      revision.evaluationStatus = dto.status;
      revision.overall = dto.overall;
      revision.decision = dto.decision;
      await em.flush();
    }
    return dto;
  }
}
