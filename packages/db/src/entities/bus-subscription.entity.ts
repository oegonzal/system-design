import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * A named cursor over some of the bus's topics. A subscriber pulls the events
 * past `cursorSeq` and acknowledges what it handled, which only ever moves the
 * cursor forward. `pulledAt` is the subscriber's last sign of life: one idle
 * past the service's declared age is removed, and the events it held back go
 * with the next sweep.
 */
@Entity()
@Index({ properties: ['pulledAt'] })
@Check({ name: 'bus_subscription_topics_check', expression: 'cardinality(topics) > 0' })
export class BusSubscription {
  @PrimaryKey({ type: 'varchar', length: 120 })
  name!: string;

  @Property({ type: 'string[]' })
  topics!: string[];

  @Property({ type: 'bigint' })
  cursorSeq!: string;

  @Property({ type: 'timestamptz' })
  createdAt!: Date;

  @Property({ type: 'timestamptz' })
  pulledAt!: Date;
}
