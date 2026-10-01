import type { Opt, Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { DesignRevision } from './design-revision.entity';
import { DesignSession } from './design-session.entity';

type ContractStatuses = (typeof Contracts)['QUALITY_RUN_STATUSES'];
const STATUSES = ['running', 'complete', 'failed'] as const satisfies ContractStatuses;

/**
 * One coaching run of a session, keyed by the quality loop's run id. The base
 * revision is what iteration 1 of the run is: on the draft path the author's
 * own revision stored as `(runId, 1)`; on the adopt path a graded revision of
 * an earlier run the loop copied. Exists so a coaching run survives a reload
 * — the newest row is what the workspace polls — and so an adopting run,
 * which has no revision at `(runId, 1)`, can still be found from its session.
 *
 * `status` is what the studio last saw of the run: `running` until a read
 * observes it finished, then terminal for good. A session read asks the loop
 * about the run only while it says `running`, so a grader that is down cannot
 * make a finished session unreadable.
 */
@Entity()
@Check({
  name: 'coaching_run_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class CoachingRun {
  /** The quality loop's own run id — the poll key. */
  @PrimaryKey({ type: 'varchar', length: 80 })
  runId!: string;

  @Index()
  @ManyToOne(() => DesignSession, { deleteRule: 'cascade' })
  session!: Rel<DesignSession>;

  @ManyToOne(() => DesignRevision, { deleteRule: 'cascade' })
  baseRevision!: Rel<DesignRevision>;

  @Property({ type: 'integer' })
  maxIterations!: number;

  @Property({ type: 'text' })
  status: Opt<Contracts.QualityRunStatus> = 'running';

  @Property({ type: 'timestamptz' })
  startedAt: Opt<Date> = new Date();
}
