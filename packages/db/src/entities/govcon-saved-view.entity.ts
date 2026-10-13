import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type { Rel } from '@mikro-orm/core';

import { GovconSearchProfile } from './govcon-search-profile.entity';

/**
 * A view a profile keeps by name: an address inside the client, since a page
 * there is its address. Saving under a name already kept replaces its
 * address, so (profile, name) is the row.
 */
@Entity()
@Unique({ properties: ['profile', 'name'] })
export class GovconSavedView {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @ManyToOne(() => GovconSearchProfile, { deleteRule: 'cascade' })
  profile!: Rel<GovconSearchProfile>;

  @Property({ type: 'varchar', length: 120 })
  name!: string;

  /** A path with its query, beginning with one `/`. */
  @Property({ type: 'text' })
  href!: string;

  @Property({ type: 'timestamptz' })
  createdAt!: Date;

  @Property({ type: 'timestamptz' })
  updatedAt!: Date;
}
