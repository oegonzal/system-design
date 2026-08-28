import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { DesignRevision, EvalJob, Evaluation } from '@sysdesign/db';

export interface RevisionWithEvaluation {
  revision: DesignRevision;
  evaluation: Evaluation | null;
}

@Injectable()
export class EvaluationsService {
  constructor(private readonly em: EntityManager) {}

  /** Full revision + its evaluation with findings, for the graph view. */
  async findRevision(id: string): Promise<RevisionWithEvaluation> {
    const revision = await this.em.findOne(DesignRevision, id);
    if (!revision) {
      throw new NotFoundException(`Revision ${id} not found`);
    }

    const evaluation = await this.em.findOne(
      Evaluation,
      { revision: revision.id },
      { populate: ['findings'] },
    );
    return { revision, evaluation };
  }

  /** 404 keys off the revision — an existing revision always has an evaluation. */
  async findEvaluation(revisionId: string): Promise<Evaluation> {
    const { evaluation } = await this.findRevision(revisionId);
    if (!evaluation) {
      // Defensive: submit creates both in one transaction, so this is a bug.
      throw new NotFoundException(`Revision ${revisionId} has no evaluation`);
    }
    return evaluation;
  }

  /**
   * Re-queue a failed evaluation in place: same row, same job row — the
   * one-verdict-per-revision invariant the unique constraints encode. 409 for
   * any other status: queued/running are already on their way, and a complete
   * verdict is re-examined by submitting the next revision, not by rerunning.
   */
  async retry(revisionId: string): Promise<Evaluation> {
    const evaluation = await this.findEvaluation(revisionId);
    if (evaluation.status !== 'failed') {
      throw new ConflictException(
        `only a failed evaluation can be retried (status is '${evaluation.status}')`,
      );
    }

    evaluation.status = 'queued';
    evaluation.error = null;

    const job = await this.em.findOne(EvalJob, { revision: revisionId });
    if (job) {
      job.status = 'queued';
      job.attempts = 0;
      job.runAfter = new Date();
      job.lockedAt = null;
      job.lockedBy = null;
    } else {
      // The job row should exist; recreate rather than fail if it does not.
      this.em.persist(this.em.create(EvalJob, { revision: revisionId }));
    }

    // Single flush → single transaction: evaluation and job reset together.
    await this.em.flush();
    return evaluation;
  }
}
