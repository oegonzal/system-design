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

import { BrowserSession } from './browser-session.entity';

type ContractStatuses = (typeof Contracts)['BROWSER_TASK_STATUSES'];
const STATUSES = ['open', 'complete', 'abandoned', 'failed'] as const satisfies ContractStatuses;

type ContractOutcomes = (typeof Contracts)['TASK_OUTCOMES'];
const OUTCOMES = ['done', 'already-done', 'skipped', 'failed'] as const satisfies ContractOutcomes;

/**
 * One unit of work inside a session, as the mission defines it — opened by a
 * plan's `taskStart` and closed by its `taskDone`. The ordinal is the task's
 * position in the session, so the pair is a stable address; `startStep` and
 * `endStep` bracket the steps the task spanned, which is how its decisions
 * are read back without a column on each. `externalRef` is the URL the plan
 * gave, kept as audit; `facets` is the unit's identity as the mission declared
 * it, the facts a record beyond the session names it by — that record is a
 * domain's, so no lookup across sessions happens here.
 *
 * cascade: a deleted session's tasks are meaningless on their own.
 */
@Entity()
@Unique({ properties: ['session', 'ordinal'] })
@Check({
  name: 'browser_task_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'browser_task_outcome_check',
  expression: `outcome is null or outcome in (${OUTCOMES.map((o) => `'${o}'`).join(', ')})`,
})
export class BrowserTask {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Index()
  @ManyToOne(() => BrowserSession, { deleteRule: 'cascade' })
  session!: Rel<BrowserSession>;

  /** 1-indexed, dense per session — the task's position among the session's units. */
  @Property({ type: 'integer' })
  ordinal!: number;

  /** The plan's own label for the unit, in the mission's terms. */
  @Property({ type: 'text' })
  label!: string;

  @Property({ type: 'text', nullable: true })
  externalRef: string | null = null;

  /** The facts the mission's Unit identity declares, with their values as the plan read them off the page. */
  @Property({ type: 'json' })
  facets: Opt<Contracts.UnitFacet[]> = [];

  @Property({ type: 'text' })
  status: Opt<Contracts.BrowserTaskStatus> = 'open';

  /** How the unit ended, in the mission's own words; null while open. */
  @Property({ type: 'text', nullable: true })
  outcome: Contracts.TaskOutcome | null = null;

  /** The session step the task opened on. */
  @Property({ type: 'integer' })
  startStep!: number;

  /** The session step the task closed on; null while open. */
  @Property({ type: 'integer', nullable: true })
  endStep: number | null = null;

  @Property({ type: 'timestamptz' })
  startedAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null = null;
}
