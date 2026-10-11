import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStates = (typeof Contracts)['INTERACTION_STATES'];
const STATES = ['open', 'answered', 'withdrawn'] as const satisfies ContractStates;

/**
 * A prompt the notifications service put to a person, from the event that
 * opened it until it closed, kept apart from the bus so it outlives the bus's
 * retention and the service's restarts. The prompt is held whole, as its
 * topic's schema accepted it; the outcome is the answer or the withdrawal that
 * closed it. The two partial indexes serve the sweeps: open prompts by when
 * they expire, closed ones by when they closed.
 */
@Entity()
@Index({
  name: 'interaction_open_expiry_index',
  expression:
    'create index "interaction_open_expiry_index" on "interaction" ("expires_at") where state = \'open\'',
})
@Index({
  name: 'interaction_closed_index',
  expression:
    'create index "interaction_closed_index" on "interaction" ("closed_at") where closed_at is not null',
})
@Check({
  name: 'interaction_state_check',
  expression: `state in (${STATES.map((state) => `'${state}'`).join(', ')})`,
})
export class Interaction {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'json' })
  prompt!: Contracts.InteractionPrompt;

  @Property({ type: 'varchar', length: 20 })
  state!: Contracts.InteractionState;

  @Property({ type: 'json', nullable: true })
  outcome!: Contracts.InteractionOutcome | null;

  @Property({ type: 'timestamptz' })
  openedAt!: Date;

  @Property({ type: 'timestamptz' })
  expiresAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}
