import type { Opt, Rel } from '@mikro-orm/core';
import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { DesignRevision } from './design-revision.entity';
import { DesignSession } from './design-session.entity';

/**
 * One coaching run of a session, keyed by the quality loop's run id. The base
 * revision is what iteration 1 of the run is: on the draft path the author's
 * own revision stored as `(runId, 1)`; on the adopt path a graded revision of
 * an earlier run the loop copied. Exists so a coaching run survives a reload
 * — the newest row is what the workspace polls — and so an adopting run,
 * which has no revision at `(runId, 1)`, can still be found from its session.
 */
@Entity()
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

  @Property({ type: 'timestamptz' })
  startedAt: Opt<Date> = new Date();
}
