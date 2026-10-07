import type { Opt } from '@mikro-orm/core';
import { Check, Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStatuses = (typeof Contracts)['BROWSER_SESSION_STATUSES'];
const STATUSES = ['running', 'complete', 'stopped', 'failed'] as const satisfies ContractStatuses;

type ContractTerminations = (typeof Contracts)['BROWSER_SESSION_TERMINATIONS'];
const TERMINATIONS = [
  'mission-complete',
  'limit-reached',
  'login-wall',
  'blocked',
  'max-tasks',
  'max-minutes',
  'max-failures',
  'brain-unavailable',
  'page-unreadable',
  'page-stalled',
  'operator-stop',
  'error',
] as const satisfies ContractTerminations;

/**
 * One browser session: a goal document driven against whatever pages appear,
 * from open to termination. The row is the session's header — its goal (path,
 * hash and the markdown itself, so a reading of an old session survives the
 * file changing), the profile and mode it ran under, the rails it declared
 * and how it ended. Every decision taken along the way is a `browser_decision`
 * row naming the quality-loop run that took it, so the session never records
 * a judgement of its own.
 *
 * `dumpRunId` is the run-dump folder the session wrote its trace into, unique
 * because one folder is one session. `criteria` is the rubric derived once at
 * open and supplied on every run, keyed by pipeline id — stored so a reader
 * can see what the runs were judged against without replaying the derivation.
 * `heartbeatAt` is the engine's sign of life: a `running` row whose beat has
 * stopped belongs to a dead process.
 */
@Entity()
@Index({ properties: ['status'] })
@Index({ properties: ['startedAt'] })
@Check({
  name: 'browser_session_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'browser_session_termination_reason_check',
  expression: `termination_reason is null or termination_reason in (${TERMINATIONS.map((t) => `'${t}'`).join(', ')})`,
})
export class BrowserSession {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** The dump folder under the sessions dump dir — minted by run-dump, so the trace is one id away. */
  @Unique()
  @Property({ type: 'varchar', length: 80 })
  dumpRunId!: string;

  @Property({ type: 'text' })
  goalPath!: string;

  /** sha256 of the goal markdown: the key that groups sessions of the same mission over time. */
  @Index()
  @Property({ type: 'varchar', length: 64 })
  goalHash!: string;

  @Property({ type: 'text' })
  goalMarkdown!: string;

  /** The persistent browser profile the session drove — a name under the profiles dir, never a path. */
  @Property({ type: 'text' })
  profile!: string;

  @Property({ type: 'boolean' })
  headed!: boolean;

  @Property({ type: 'text' })
  status: Opt<Contracts.BrowserSessionStatus> = 'running';

  /** Why it ended — the plan's cause word or the engine's rail — once it has. */
  @Property({ type: 'text', nullable: true })
  terminationReason: Contracts.BrowserSessionTermination | null = null;

  @Property({ type: 'text', nullable: true })
  terminationDetail: string | null = null;

  /** The engine's own stop rules as declared for this session. */
  @Property({ type: 'json' })
  limits!: Contracts.SessionRailsDto;

  /** The rubric derived once at open, by pipeline id; null until derived. */
  @Property({ type: 'json', nullable: true })
  criteria: Record<string, Contracts.SuccessCriterion[]> | null = null;

  /** How many pages were observed and planned for, counted as the engine moves. */
  @Property({ type: 'integer' })
  steps: Opt<number> = 0;

  @Property({ type: 'timestamptz' })
  startedAt: Opt<Date> = new Date();

  /** Written at open and refreshed while the engine runs; stale means the process is gone. */
  @Property({ type: 'timestamptz' })
  heartbeatAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null = null;

  /** The failure that ended a `failed` session, in the shape the DTO reports it. */
  @Property({ type: 'json', nullable: true })
  error: Contracts.BrowserSessionDto['error'] = null;
}
