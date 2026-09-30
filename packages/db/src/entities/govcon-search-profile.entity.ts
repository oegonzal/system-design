import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

/**
 * One company's search profile: the validated `Contracts.SearchProfile` as
 * one document, keyed by its slug. The document is validated by the govcon
 * package's schema on every write, so the row never holds a profile the
 * scorer cannot price. At most one row is the default — the profile every
 * route uses when none is named; a partial unique index enforces it.
 */
@Entity()
@Index({
  name: 'govcon_search_profile_default_index',
  expression:
    'create unique index "govcon_search_profile_default_index" on "govcon_search_profile" ("is_default") where is_default',
})
export class GovconSearchProfile {
  @PrimaryKey({ type: 'varchar', length: 40 })
  id!: string;

  @Property({ type: 'text' })
  company!: string;

  @Property({ type: 'json' })
  document!: Contracts.SearchProfile;

  @Property({ type: 'boolean' })
  isDefault!: boolean;

  @Property({ type: 'timestamptz' })
  createdAt!: Date;

  @Property({ type: 'timestamptz' })
  updatedAt!: Date;
}
