import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

/**
 * A SAM.gov registrant as stored: `Contracts.Entity`, keyed by its unique
 * entity id, refreshed on every lookup. What a bidder asks of an awardee or
 * of its own company — registered, until when, claiming what, excluded?
 */
@Entity()
export class GovconEntity {
  @PrimaryKey({ type: 'varchar', length: 12 })
  uei!: string;

  @Property({ type: 'varchar', length: 16, nullable: true })
  cage!: string | null;

  @Property({ type: 'text' })
  legalName!: string;

  @Property({ type: 'text', nullable: true })
  registrationStatus!: string | null;

  @Property({ type: 'date', nullable: true })
  registrationExpiresAt!: string | null;

  @Property({ type: 'json' })
  businessTypes!: string[];

  @Property({ type: 'json' })
  sbaCertifications!: string[];

  @Property({ type: 'json' })
  naics!: Contracts.EntityNaics[];

  @Property({ type: 'json' })
  psc!: string[];

  @Property({ type: 'boolean' })
  excluded!: boolean;

  @Property({ type: 'text', nullable: true })
  website!: string | null;

  @Property({ type: 'timestamptz' })
  fetchedAt!: Date;
}
