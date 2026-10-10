import type { Opt } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStatuses = (typeof Contracts)['QUALITY_RUN_STATUSES'];
const STATUSES = ['running', 'complete', 'failed'] as const satisfies ContractStatuses;

type ContractOpenerKinds = (typeof Contracts)['RUN_OPENER_KINDS'];
const OPENER_KINDS = ['browser-session'] as const satisfies ContractOpenerKinds;

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
  'produce-lost',
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
@Index({ properties: ['openedById'] })
// `= any (array[…])`, not `in (…)`: Postgres keeps this form at any size, while
// it stores a one-item `in` as `=`, which the migration check reads as drift.
@Check({
  name: 'quality_run_opened_by_kind_check',
  expression: `opened_by_kind is null or opened_by_kind = any (array[${OPENER_KINDS.map((k) => `'${k}'`).join(', ')}])`,
})
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

  /** Which model backed the run. Rows recorded before the loop required a model carry their old shape; only `model` is read. */
  @Property({ type: 'json' })
  llm!: Contracts.LlmModelDto;

  @Property({ type: 'json' })
  request!: Contracts.QualityRunRequestSummary;

  /**
   * The run this one was opened for, when a run composed it — the
   * memory-recall run a run's recall opens points at that run. Held as the
   * parent's id; set-null on delete, so a child outlives a parent removed
   * later. Null for a run started on its own.
   */
  @Index()
  @ManyToOne(() => QualityRun, { nullable: true, mapToPk: true, deleteRule: 'set null' })
  parentRun: string | null = null;

  /**
   * Who opened the run, as its caller said: a kind from the contracts'
   * vocabulary, the caller's own id — indexed, for "what this caller opened" —
   * and what the run was to it. All three null when nobody said; the loop
   * records them and reads them for nothing else.
   */
  @Property({ type: 'text', nullable: true })
  openedByKind: Contracts.RunOpenerKind | null = null;

  @Property({ type: 'varchar', length: 80, nullable: true })
  openedById: string | null = null;

  @Property({ type: 'text', nullable: true })
  openedByLabel: string | null = null;

  /**
   * What the run recalled before it produced, lessons included — written as
   * it moves, like `exchanges`, so a reader sees `recalling` while it runs.
   * Null when the run did not ask to recall.
   */
  @Property({ type: 'json', nullable: true })
  recall: Contracts.RunRecallDto | null = null;

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
