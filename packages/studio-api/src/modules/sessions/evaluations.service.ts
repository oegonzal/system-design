import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { describeLostGrade, type EvaluationDto } from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import { isLoopUnavailable, QualityLoopClient } from '../quality-loop/quality-loop.client';
import { toEvaluationDto } from './evaluation.mapper';

/** One grade a revision points at: the row and the run iteration, since a re-grade repoints the row. */
const gradeOf = (revision: DesignRevision): string =>
  `${revision.id}@${revision.qualityRunId}#${revision.qualityIteration}`;

/**
 * A revision's grade, read from the loop. The row caches the terminal
 * scalars on the way through, so lists and timelines answer without the
 * loop; the findings and criterion results are always the loop's, live. A
 * read that finds nothing says which thing is missing: the `revision` — the
 * same 404 a read of the revision itself gives — or its `evaluation`.
 */
@Injectable()
export class EvaluationsService {
  /** The grades this process has read from the loop: their cache is written by the rule it runs. */
  private readonly read = new Set<string>();

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
    this.read.add(gradeOf(revision));
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

    const dto = toEvaluationDto(
      run,
      revision.qualityIteration,
      {
        graph: revision.graph,
        brief: revision.brief,
        narrative: revision.narrative,
        model: revision.model,
      },
      new Date().toISOString(),
    );
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

  /**
   * Bring the cached standings a list shows up to the grades they cache. A
   * cache written before a grade that assessed too little stopped earning a
   * number (`EvaluationDto.unscored`) still holds the controller's number,
   * and its `escalate` — the evidence gate's decision — reads as a verdict on
   * every chip, row and export that shows it until someone opens that grade.
   * Only a complete, scored escalation can be such a cache, so each one this
   * process has not read is read once (`syncRevision`), which rewrites it if
   * the grade earned no score; one that is a verdict stays as it was and is
   * not asked about again. A list never waits on the loop for this: a loop
   * that cannot answer ends the pass, the list answers from the cache, and a
   * later read tries again.
   */
  async refreshStandings(revisions: Iterable<DesignRevision>): Promise<void> {
    for (const revision of revisions) {
      if (!this.mayCacheAnOldStanding(revision)) continue;
      try {
        await this.syncRevision(revision);
      } catch (error) {
        if (isLoopUnavailable(error)) return;
        throw error;
      }
    }
  }

  private mayCacheAnOldStanding(revision: DesignRevision): boolean {
    return (
      revision.qualityRunId !== null &&
      revision.qualityIteration !== null &&
      revision.evaluationStatus === 'complete' &&
      revision.overall !== null &&
      revision.decision === 'escalate' &&
      !this.read.has(gradeOf(revision))
    );
  }
}
