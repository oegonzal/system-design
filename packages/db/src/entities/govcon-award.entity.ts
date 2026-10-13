import { PrimaryKeyProp } from '@mikro-orm/core';
import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractSources = (typeof Contracts)['AWARD_SOURCES'];
const SOURCES = ['sam.gov', 'usaspending'] as const satisfies ContractSources;

/**
 * A contract award as stored: SAM.gov's Contract Awards record or a
 * USAspending award, normalized to `Contracts.Award` and keyed by the source
 * and the source's own id, so a re-fetch upserts. Codes are `varchar` with
 * headroom; money is `numeric(16,2)`; the place is the same shape a notice
 * keeps.
 */
@Entity()
@Index({ name: 'govcon_award_naics_index', properties: ['naicsCode', 'signedAt'] })
@Index({ properties: ['solicitationNumber'] })
@Index({ properties: ['awardeeUei'] })
@Check({
  name: 'govcon_award_source_check',
  expression: `source in (${SOURCES.map((s) => `'${s}'`).join(', ')})`,
})
export class GovconAward {
  [PrimaryKeyProp]?: ['source', 'externalId'];

  @PrimaryKey({ type: 'varchar', length: 20 })
  source!: Contracts.AwardSource;

  @PrimaryKey({ type: 'varchar', length: 160 })
  externalId!: string;

  @Property({ type: 'text', nullable: true })
  piid!: string | null;

  @Property({ type: 'varchar', length: 40, nullable: true })
  awardType!: string | null;

  @Property({ type: 'text', nullable: true })
  solicitationNumber!: string | null;

  @Property({ type: 'varchar', length: 16, nullable: true })
  naicsCode!: string | null;

  @Property({ type: 'varchar', length: 16, nullable: true })
  pscCode!: string | null;

  @Property({ type: 'text', nullable: true })
  agencyPath!: string | null;

  @Property({ type: 'text', nullable: true })
  agencyCode!: string | null;

  @Property({ type: 'text', nullable: true })
  awardeeName!: string | null;

  @Property({ type: 'varchar', length: 12, nullable: true })
  awardeeUei!: string | null;

  @Property({ type: 'numeric', precision: 16, scale: 2, nullable: true })
  amount!: string | null;

  @Property({ type: 'integer', nullable: true })
  offersReceived!: number | null;

  @Property({ type: 'varchar', length: 16, nullable: true })
  extentCompeted!: string | null;

  @Property({ type: 'varchar', length: 32, nullable: true })
  setAsideCode!: string | null;

  @Property({ type: 'date' })
  signedAt!: string;

  @Property({ type: 'date', nullable: true })
  popStartAt!: string | null;

  @Property({ type: 'date', nullable: true })
  completionAt!: string | null;

  @Property({ type: 'json', nullable: true })
  placeOfPerformance!: Contracts.OpportunityPlace | null;

  @Property({ type: 'timestamptz' })
  fetchedAt!: Date;
}
