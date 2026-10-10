import type { Opt } from '@mikro-orm/core';
import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStatuses = (typeof Contracts)['QUALITY_RUN_STATUSES'];
const STATUSES = ['running', 'complete', 'failed'] as const satisfies ContractStatuses;

type ContractOpenerKinds = (typeof Contracts)['RUN_OPENER_KINDS'];
const OPENER_KINDS = ['browser-session'] as const satisfies ContractOpenerKinds;

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
@Index({ properties: ['openedById'] })
// `= any (array[…])`, not `in (…)`: Postgres keeps this form at any size, while
// it stores a one-item `in` as `=`, which the migration check reads as drift.
@Check({
  name: 'orchestration_run_opened_by_kind_check',
  expression: `opened_by_kind is null or opened_by_kind = any (array[${OPENER_KINDS.map((k) => `'${k}'`).join(', ')}])`,
})
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

  /**
   * Who opened the orchestration, as its caller said: a kind from the contracts'
   * vocabulary, the caller's own id — indexed, for "what this caller opened" —
   * and what the orchestration was to it. All three null when nobody said; the loop
   * records them and reads them for nothing else.
   */
  @Property({ type: 'text', nullable: true })
  openedByKind: Contracts.RunOpenerKind | null = null;

  @Property({ type: 'varchar', length: 80, nullable: true })
  openedById: string | null = null;

  @Property({ type: 'text', nullable: true })
  openedByLabel: string | null = null;

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

  /**
   * Liveness (ENG-10): written at open and refreshed while the run is in
   * flight. The janitor fails a `running` row only once this is older than
   * the stale threshold, so a row is another process's until it says nothing
   * for that long — and a late close from that process reclaims it.
   */
  @Property({ type: 'timestamptz' })
  heartbeatAt!: Date;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
