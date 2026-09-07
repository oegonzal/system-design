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

import { QualityRun } from './quality-run.entity';

type ContractStatuses = (typeof Contracts)['QUALITY_RUN_STATUSES'];
const STATUSES = ['running', 'complete', 'failed'] as const satisfies ContractStatuses;

/**
 * One memory run: the orchestration of recall → target → digest → store over
 * three ordinary quality runs, which keep their own rows. This row holds what
 * exists nowhere else — the step ledger with its closed reasons, the
 * availability the run saw at open, and the linkage between the children.
 * A plain uuid: nothing outside the service names it.
 */
@Entity()
@Index({ properties: ['startedAt'] })
@Index({ properties: ['pipeline'] })
@Index({ properties: ['status'] })
@Check({
  name: 'memory_run_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class MemoryRun {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** The target pipeline; the memory pipelines are fixed by the module. */
  @Property({ type: 'varchar', length: 80 })
  pipeline!: string;

  @Property({ type: 'text' })
  status: Opt<Contracts.QualityRunStatus> = 'running';

  /** The bare goal as requested; the target's own record carries the goal with memory appended. */
  @Property({ type: 'json' })
  request!: Contracts.QualityRunRequestSummary;

  @Property({ type: 'json' })
  embedding!: Contracts.LlmAvailabilityDto;

  @Property({ type: 'json' })
  store!: Contracts.MemoryStoreAvailabilityDto;

  @Property({ type: 'json' })
  steps!: Record<Contracts.MemoryStep, Contracts.MemoryStepDto>;

  @Index()
  @ManyToOne(() => QualityRun, { nullable: true, deleteRule: 'set null' })
  recallRun: Rel<QualityRun> | null = null;

  @Index()
  @ManyToOne(() => QualityRun, { nullable: true, deleteRule: 'set null' })
  targetRun: Rel<QualityRun> | null = null;

  @Index()
  @ManyToOne(() => QualityRun, { nullable: true, deleteRule: 'set null' })
  digestRun: Rel<QualityRun> | null = null;

  @Property({ type: 'json', nullable: true })
  error: Contracts.RunErrorDto | null = null;

  @Property({ type: 'timestamptz' })
  startedAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
