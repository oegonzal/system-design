import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { Interaction } from './interaction.entity';

/**
 * Where one prompt reached one person on one channel: the address it went to
 * and the channel's own reference for the message, so a reply to that message
 * finds its prompt and the message can show how the prompt ended. `closedAt`
 * is set once the message shows it; a delivery still unset is one a replayed
 * outcome closes again.
 */
@Entity()
@Unique({ properties: ['channel', 'address', 'messageRef'] })
export class InteractionDelivery {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Index()
  @ManyToOne(() => Interaction, { mapToPk: true, deleteRule: 'cascade' })
  interaction!: string;

  @Property({ type: 'varchar', length: 40 })
  channel!: string;

  @Property({ type: 'varchar', length: 80 })
  address!: string;

  @Property({ type: 'varchar', length: 80 })
  messageRef!: string;

  @Property({ type: 'timestamptz' })
  deliveredAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}
