import type { Opt } from '@mikro-orm/core';
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * One event on the notifications bus: append-only and ordered by `seq`, which
 * the database assigns and the bus hands out as the event's only identity.
 * The service appends under one advisory lock, so rows commit in seq order
 * and a subscription's cursor never passes a row still being written. The
 * payload is what its topic's declared schema accepted on the way in.
 */
@Entity()
@Index({ properties: ['topic', 'seq'] })
@Index({ properties: ['publishedAt'] })
export class BusEvent {
  @PrimaryKey({ type: 'bigint', autoincrement: true })
  seq!: string & Opt;

  @Property({ type: 'varchar', length: 80 })
  topic!: string;

  /** Who published it, as the publisher names itself. */
  @Property({ type: 'varchar', length: 80 })
  source!: string;

  @Property({ type: 'json' })
  payload!: unknown;

  @Property({ type: 'timestamptz' })
  publishedAt!: Date;
}
