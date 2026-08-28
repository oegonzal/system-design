import type { Opt, Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { DesignRevision } from './design-revision.entity';

export const JOB_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export type EvalJobStatus = (typeof JOB_STATUSES)[number];

/**
 * The Postgres-backed work queue between the API (producer) and the eval
 * worker (consumer). One row per revision — a retry resets this row rather
 * than inserting a sibling, so the queue can never hold two verdicts-in-flight
 * for the same snapshot.
 *
 * The worker claims with `select … for update skip locked` over
 * (status, run_after) — hence the composite index — and a reaper requeues
 * `running` rows whose `locked_at` has gone stale, which is what makes a
 * worker crash a delay instead of a lost job.
 *
 * Internal plumbing: statuses live here, not in contracts — the frontend only
 * ever sees the Evaluation's status.
 */
@Entity()
@Unique({ properties: ['revision'] })
@Index({ properties: ['status', 'runAfter'] })
@Check({
  name: 'eval_job_status_check',
  expression: `status in (${JOB_STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class EvalJob {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @ManyToOne(() => DesignRevision, { deleteRule: 'cascade' })
  revision!: Rel<DesignRevision>;

  @Property({ type: 'text' })
  status: Opt<EvalJobStatus> = 'queued';

  @Property({ type: 'integer' })
  attempts: Opt<number> = 0;

  @Property({ type: 'integer' })
  maxAttempts: Opt<number> = 3;

  /** Not-before time: exponential backoff pushes this forward on failure. */
  @Property({ type: 'timestamptz' })
  runAfter: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  lockedAt: Date | null = null;

  @Property({ type: 'varchar', length: 60, nullable: true })
  lockedBy: string | null = null;

  @Property({ type: 'text', nullable: true })
  lastError: string | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
