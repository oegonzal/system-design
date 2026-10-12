import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStatuses = (typeof Contracts)['APPLICATION_STATUSES'];
const STATUSES = [
  'in-progress',
  'submitted',
  'submitted-before',
  'skipped',
  'failed',
  'abandoned',
] as const satisfies ContractStatuses;

type ContractSources = (typeof Contracts)['APPLICATION_SOURCES'];
const SOURCES = ['session', 'manual'] as const satisfies ContractSources;

/**
 * One job application as the job-application service keeps it, for one
 * subject. A session-sourced row is keyed by the session's own unit id, so an
 * intake that hears the same event twice changes nothing; a hand-entered one
 * is minted. `identityKey` is the contracts' key of the company facet — how a
 * hand-entered "ACME" and a recorded "Acme" meet. The session's ids are plain
 * columns, never foreign keys: the session is another service. `expiresAt`
 * bounds a unit still in progress by the session's own declared lifetime.
 */
@Entity()
@Index({ properties: ['subject', 'identityKey'] })
@Index({ properties: ['status'] })
@Index({ properties: ['openedAt'] })
@Check({
  name: 'job_application_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'job_application_source_check',
  expression: `source in (${SOURCES.map((s) => `'${s}'`).join(', ')})`,
})
export class JobApplication {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'text' })
  subject!: string;

  /** The company as the page named it, or as the person typed it. */
  @Property({ type: 'text' })
  company!: string;

  @Property({ type: 'text' })
  identityKey!: string;

  @Property({ type: 'text' })
  label!: string;

  @Property({ type: 'text', nullable: true })
  url: string | null = null;

  @Property({ type: 'varchar', length: 20 })
  source!: Contracts.ApplicationSource;

  @Property({ type: 'varchar', length: 80, nullable: true })
  sessionId: string | null = null;

  @Property({ type: 'text', nullable: true })
  profile: string | null = null;

  @Property({ type: 'integer', nullable: true })
  unitOrdinal: number | null = null;

  @Property({ type: 'varchar', length: 20 })
  status!: Contracts.ApplicationStatus;

  @Property({ type: 'timestamptz' })
  openedAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  closedAt: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null = null;
}
