import type { Opt } from '@mikro-orm/core';
import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStatuses = (typeof Contracts)['QUALITY_RUN_STATUSES'];
const STATUSES = ['running', 'complete', 'failed'] as const satisfies ContractStatuses;

/**
 * One orchestration run: a declared map of pipelines executed in order over
 * ordinary quality runs, which keep their own rows. This row holds what exists
 * nowhere else — the step ledger with its closed reasons and what the
 * orchestrator observed at open. The children are `orchestration_run_child`
 * rows, one per step that ran a pipeline, so a deleted child never takes the
 * record with it. A plain uuid: nothing outside the service names it.
 */
@Entity()
@Index({ properties: ['startedAt'] })
@Index({ properties: ['orchestrator'] })
@Index({ properties: ['pipeline'] })
@Index({ properties: ['status'] })
@Check({
  name: 'orchestration_run_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class OrchestrationRun {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Property({ type: 'varchar', length: 80 })
  orchestrator!: string;

  /** The target pipeline the request named, when the orchestrator takes one. */
  @Property({ type: 'varchar', length: 80, nullable: true })
  pipeline: string | null = null;

  @Property({ type: 'text' })
  status: Opt<Contracts.QualityRunStatus> = 'running';

  @Property({ type: 'json' })
  request!: Contracts.OrchestrationRequestSummary;

  @Property({ type: 'json' })
  context!: Record<string, unknown>;

  @Property({ type: 'json' })
  steps!: Record<string, Contracts.OrchestrationStepDto>;

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
