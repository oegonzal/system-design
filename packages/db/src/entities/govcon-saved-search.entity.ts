import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import type { Rel } from '@mikro-orm/core';
import type * as Contracts from '@sysdesign/contracts';

import { GovconSearchProfile } from './govcon-search-profile.entity';

/**
 * A saved search: one `QueryFilter` a profile keeps by name, run on demand
 * against the last `days` days and — when `included_in_pull` — as one slice
 * of the profile's daily pull, in `pull_order`. The profile's pull is
 * exactly its flagged searches, so there is one place a slice is declared.
 */
@Entity()
@Unique({ properties: ['profile', 'name'] })
@Index({
  name: 'govcon_saved_search_pull_index',
  properties: ['profile', 'includedInPull', 'pullOrder'],
})
export class GovconSavedSearch {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @ManyToOne(() => GovconSearchProfile, { deleteRule: 'cascade' })
  profile!: Rel<GovconSearchProfile>;

  @Property({ type: 'varchar', length: 120 })
  name!: string;

  @Property({ type: 'json' })
  filter!: Contracts.QueryFilter;

  /** The window a run by itself asks for: the last `days` days. */
  @Property({ type: 'integer' })
  days!: number;

  @Property({ type: 'boolean' })
  includedInPull!: boolean;

  @Property({ type: 'integer' })
  pullOrder!: number;

  @Property({ type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @Property({ type: 'timestamptz' })
  createdAt!: Date;

  @Property({ type: 'timestamptz' })
  updatedAt!: Date;
}
