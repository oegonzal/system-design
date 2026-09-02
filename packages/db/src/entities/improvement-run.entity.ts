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
import type * as Contracts from '@sysdesign/contracts';

import { DesignRevision } from './design-revision.entity';
import { DesignSession } from './design-session.entity';

type ContractRunStatuses = (typeof Contracts)['IMPROVEMENT_RUN_STATUSES'];
const RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const satisfies ContractRunStatuses;

/**
 * One AI-coach improvement run: the work-queue row between the API (producer)
 * and the eval worker's improvement poller (consumer), plus the run's live
 * trajectory. Same claim/reaper discipline as `EvalJob` — `for update skip
 * locked` on `status`, a stale `locked_at` requeues, `attempts` caps poison
 * loops — but no `run_after`: a run that fails terminally is simply failed,
 * and the author starts another.
 *
 * The partial unique index is the arbiter for "one active run per session":
 * the service's friendly 409 is a pre-check, the index is the guarantee.
 *
 * No baseScore/bestScore columns: trajectory entry 0 IS the scored baseline,
 * so the DTO derives both and the two can never disagree.
 */
@Entity()
@Unique({
  name: 'improvement_run_one_active_per_session',
  properties: ['session'],
  where: `status in ('queued', 'running')`,
})
@Index({ properties: ['status'] })
@Check({
  name: 'improvement_run_status_check',
  expression: `status in (${RUN_STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class ImprovementRun {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** cascade: a deleted session's runs are meaningless on their own. */
  @ManyToOne(() => DesignSession, { deleteRule: 'cascade' })
  session!: Rel<DesignSession>;

  /** The author's design the run started from. */
  @ManyToOne(() => DesignRevision, { deleteRule: 'cascade' })
  baseRevision!: Rel<DesignRevision>;

  /** Highest-scoring accepted revision so far; null until one is accepted. */
  @ManyToOne(() => DesignRevision, { nullable: true, deleteRule: 'set null' })
  bestRevision: Rel<DesignRevision> | null = null;

  @Property({ type: 'text' })
  status: Opt<Contracts.ImprovementRunStatus> = 'queued';

  @Property({ type: 'integer' })
  maxIterations!: number;

  /** The live trajectory — flushed every iteration so pollers see progress. */
  @Property({ type: 'json' })
  iterations: Opt<Contracts.ImprovementIteration[]> = [];

  @Property({ type: 'text', nullable: true })
  stoppedReason: Contracts.ImprovementStopReason | null = null;

  @Property({ type: 'text', nullable: true })
  error: string | null = null;

  @Property({ type: 'integer' })
  attempts: Opt<number> = 0;

  @Property({ type: 'integer' })
  maxAttempts: Opt<number> = 3;

  @Property({ type: 'timestamptz', nullable: true })
  lockedAt: Date | null = null;

  @Property({ type: 'varchar', length: 60, nullable: true })
  lockedBy: string | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
