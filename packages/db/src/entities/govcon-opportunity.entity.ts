import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

/**
 * One SAM.gov contract opportunity: `Contracts.Opportunity` normalized, plus
 * the record as received (`raw`) so a later normalizer can re-read it without
 * spending a request. The primary key is SAM.gov's own notice id, so a
 * re-pull upserts instead of duplicating; `first_seen_at` holds across upserts
 * while `last_seen_at` advances — the two timestamps the pull report reads.
 *
 * No property initializers on purpose: rows arrive through `upsertMany`,
 * which never runs them, and the schema drift gate expects no SQL defaults.
 * Codes are `varchar` with headroom over their documented width; free text is
 * `text` — an oddly shaped upstream value must never fail a whole batch.
 */
@Entity()
@Index({ properties: ['postedAt'] })
@Index({ properties: ['naicsCode'] })
@Index({ properties: ['setAsideCode'] })
@Index({ properties: ['responseDeadlineAt'] })
export class GovconOpportunity {
  @PrimaryKey({ type: 'varchar', length: 80 })
  noticeId!: string;

  @Property({ type: 'text' })
  title!: string;

  @Property({ type: 'text', nullable: true })
  solicitationNumber!: string | null;

  @Property({ type: 'text', nullable: true })
  agencyPath!: string | null;

  @Property({ type: 'text', nullable: true })
  agencyCode!: string | null;

  @Property({ type: 'timestamptz' })
  postedAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  responseDeadlineAt!: Date | null;

  @Property({ type: 'timestamptz', nullable: true })
  archiveAt!: Date | null;

  @Property({ type: 'text', nullable: true })
  archiveType!: string | null;

  @Property({ type: 'text', nullable: true })
  noticeType!: string | null;

  @Property({ type: 'text', nullable: true })
  baseType!: string | null;

  @Property({ type: 'boolean', nullable: true })
  active!: boolean | null;

  @Property({ type: 'varchar', length: 16, nullable: true })
  naicsCode!: string | null;

  @Property({ type: 'json' })
  naicsCodes!: string[];

  @Property({ type: 'varchar', length: 16, nullable: true })
  classificationCode!: string | null;

  @Property({ type: 'varchar', length: 32, nullable: true })
  setAsideCode!: string | null;

  @Property({ type: 'text', nullable: true })
  setAsideDescription!: string | null;

  @Property({ type: 'text', nullable: true })
  organizationType!: string | null;

  @Property({ type: 'json', nullable: true })
  placeOfPerformance!: Contracts.OpportunityPlace | null;

  @Property({ type: 'json', nullable: true })
  officeAddress!: Contracts.OpportunityOffice | null;

  @Property({ type: 'json' })
  pointsOfContact!: Contracts.OpportunityContact[];

  @Property({ type: 'text', nullable: true })
  descriptionUrl!: string | null;

  @Property({ type: 'text', nullable: true })
  uiLink!: string | null;

  @Property({ type: 'text', nullable: true })
  additionalInfoLink!: string | null;

  @Property({ type: 'json' })
  resourceLinks!: string[];

  @Property({ type: 'json', nullable: true })
  award!: Contracts.OpportunityAward | null;

  /** The record exactly as the source returned it. */
  @Property({ type: 'json' })
  raw!: unknown;

  @Property({ type: 'varchar', length: 40 })
  source!: string;

  @Property({ type: 'timestamptz' })
  firstSeenAt!: Date;

  @Property({ type: 'timestamptz' })
  lastSeenAt!: Date;

  /**
   * The notice description as text, once fetched: one budgeted request, kept
   * for good. A pull never writes these three columns — the row mapper leaves
   * them out, so an upsert cannot clear them.
   */
  @Property({ type: 'text', nullable: true })
  descriptionText!: string | null;

  /** The description response as received. */
  @Property({ type: 'json', nullable: true })
  descriptionRaw!: unknown;

  @Property({ type: 'timestamptz', nullable: true })
  descriptionFetchedAt!: Date | null;
}
