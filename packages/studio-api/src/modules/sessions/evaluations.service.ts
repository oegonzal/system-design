import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { EvaluationDto } from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { toEvaluationDto } from './evaluation.mapper';

/**
 * A revision's grade, read from the loop. The row caches the terminal
 * scalars on the way through, so lists and timelines answer without the
 * loop; the findings and criterion results are always the loop's, live.
 */
@Injectable()
export class EvaluationsService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
  ) {}

  async forRevision(revisionId: string): Promise<EvaluationDto> {
    const revision = await this.em.findOne(DesignRevision, revisionId);
    if (!revision) throw new NotFoundException(`Revision ${revisionId} not found`);
    if (revision.qualityRunId === null || revision.qualityIteration === null) {
      throw new NotFoundException(
        `Revision ${revisionId} was stored before grading moved to the quality loop and has no evaluation`,
      );
    }
    return this.syncRevision(revision);
  }

  /**
   * Read the revision's run, map it, and write the terminal cache back when
   * it differs — the one place the cache is refreshed, shared with whoever
   * must know whether a grade is still in flight before acting on it.
   */
  async syncRevision(
    revision: DesignRevision,
    em: EntityManager = this.em,
  ): Promise<EvaluationDto> {
    if (revision.qualityRunId === null || revision.qualityIteration === null) {
      throw new NotFoundException(`Revision ${revision.id} has no evaluation`);
    }
    const run = await this.loop.getRun(revision.qualityRunId);
    if (!run) throw new NotFoundException(`Run ${revision.qualityRunId} not found`);

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
