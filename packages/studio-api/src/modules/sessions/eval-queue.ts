import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { DesignRevision, EvalJob } from '@sysdesign/db';

/**
 * The seam between "a revision was submitted" and "something will evaluate
 * it". Abstract class rather than an interface so it doubles as the Nest
 * injection token. Swapping Postgres for BullMQ (or anything else) means one
 * new implementation and one provider line — the submit flow never changes.
 */
export abstract class EvalQueue {
  /**
   * Called inside the submit transaction with that transaction's
   * EntityManager, so the job enqueue commits or rolls back atomically with
   * the revision and its evaluation.
   */
  abstract enqueue(em: EntityManager, revision: DesignRevision): Promise<void>;
}

/** Postgres-backed queue: one EvalJob row, claimed by the eval worker. */
@Injectable()
export class PostgresEvalQueue extends EvalQueue {
  async enqueue(em: EntityManager, revision: DesignRevision): Promise<void> {
    // Defaults do the rest: status 'queued', runAfter now, attempts 0.
    em.persist(em.create(EvalJob, { revision }));
  }
}
