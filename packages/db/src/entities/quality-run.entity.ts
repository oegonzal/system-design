import type { Opt } from '@mikro-orm/core';
import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStatuses = (typeof Contracts)['QUALITY_RUN_STATUSES'];
const STATUSES = ['running', 'complete', 'failed'] as const satisfies ContractStatuses;

type ContractDecisions = (typeof Contracts)['DECISIONS'];
const DECISIONS = [
  'accept',
  'revise',
  'retry',
  'escalate',
  'reject',
] as const satisfies ContractDecisions;

type ContractStopReasons = (typeof Contracts)['STOP_REASONS'];
const STOP_REASONS = [
  'accepted',
  'rejected',
  'escalated',
  'plateau',
  'max-iterations',
  'producer-unavailable',
] as const satisfies ContractStopReasons;

/** The dump writes it; the row keeps it so a run can be traced to its commit without the folder. */
export interface QualityRunGit {
  branch: string;
  headSha: string;
}

/**
 * One quality-loop run: the wire `QualityRunDto` minus its trace body, which
 * lives in the child tables (criteria, iterations, findings, criterion
 * results) and is reassembled exactly by the service's mapper.
 *
 * The primary key is NOT a uuid, deliberately: it is the run id run-dump's
 * `makeRunId` mints (`2026-09-06T00-00-00-000-abc123-quality`), which already
 * names the dump folder and appears in URLs. A second id would be noise
 * nothing joins on.
 *
 * `exchanges` is the live signal (updated as the loop attributes model calls);
 * `final_decision`, `stop_reason`, `overall`, `best_iteration` and `lessons`
 * are the trace's header, denormalised here so the list is one table scan.
 */
@Entity()
@Index({ properties: ['startedAt'] })
@Index({ properties: ['pipeline'] })
@Index({ properties: ['status'] })
@Check({
  name: 'quality_run_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'quality_run_final_decision_check',
  expression: `final_decision is null or final_decision in (${DECISIONS.map((d) => `'${d}'`).join(', ')})`,
})
@Check({
  name: 'quality_run_stop_reason_check',
  expression: `stop_reason is null or stop_reason in (${STOP_REASONS.map((r) => `'${r}'`).join(', ')})`,
})
export class QualityRun {
  @PrimaryKey({ type: 'varchar', length: 80 })
  id!: string;

  @Property({ type: 'varchar', length: 80 })
  pipeline!: string;

  /** Known at open time from the definition; the trace repeats it. */
  @Property({ type: 'varchar', length: 40, nullable: true })
  pipelineVersion: string | null = null;

  @Property({ type: 'text' })
  status: Opt<Contracts.QualityRunStatus> = 'running';

  @Property({ type: 'text', nullable: true })
  finalDecision: Contracts.Decision | null = null;

  @Property({ type: 'text', nullable: true })
  stopReason: Contracts.StopReason | null = null;

  /** The best iteration's `decision.scores.overall`. */
  @Property({ type: 'double', nullable: true })
  overall: number | null = null;

  @Property({ type: 'integer', nullable: true })
  bestIteration: number | null = null;

  @Property({ type: 'integer' })
  exchangeCount: Opt<number> = 0;

  @Property({ type: 'json' })
  llm!: Contracts.LlmAvailabilityDto;

  @Property({ type: 'json' })
  request!: Contracts.QualityRunRequestSummary;

  @Property({ type: 'json' })
  git!: QualityRunGit;

  /** `LlmExchangeSummaryDto[]` — prompts and responses stay in the dump. */
  @Property({ type: 'json' })
  exchanges: Opt<Contracts.LlmExchangeSummaryDto[]> = [];

  @Property({ type: 'json', nullable: true })
  lessons: Contracts.Lesson[] | null = null;

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
