import { Check, Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractKinds = (typeof Contracts)['ALERT_KINDS'];
const KINDS = [
  'award-ending',
  'award-end-moved',
  'award-notice',
  'pulse-above-band',
  'lead-new',
] as const satisfies ContractKinds;

/**
 * One alert that was raised, by the key that makes it the same alert
 * tomorrow or in another scope — its kind and its subject — so each is
 * raised once. `scope_key` is the scope it was first found in, null for one
 * found on a tracked target. `payload` is what was published, kept so the
 * alert can be read back as the line a person was sent; null on a row from
 * before payloads were kept. `position` is its place among the alerts raised
 * with it, the weightiest first, so they read back in the digest's order.
 * `event_seq` is the bus's receipt for the
 * published event; `prompt_id` the digest it was listed in, null when the
 * digest could not be published. Rows are only ever written for what was
 * published.
 */
@Entity()
@Index({ properties: ['raisedAt'] })
@Unique({ properties: ['kind', 'subject'] })
@Check({
  name: 'govcon_alert_kind_check',
  expression: `kind in (${KINDS.map((kind) => `'${kind}'`).join(', ')})`,
})
export class GovconAlert {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'varchar', length: 32 })
  kind!: Contracts.AlertKind;

  /** An award's id, a fiscal period — what the kind's rule names. */
  @Property({ type: 'text' })
  subject!: string;

  /** sha256 hex of the scope the alert was computed in. */
  @Property({ type: 'varchar', length: 64, nullable: true })
  scopeKey!: string | null;

  @Property({ type: 'json', nullable: true })
  payload!: unknown;

  @Property({ type: 'varchar', length: 40 })
  profileId!: string;

  @Property({ type: 'timestamptz' })
  raisedAt!: Date;

  @Property({ type: 'integer', default: 0 })
  position!: number;

  @Property({ type: 'text' })
  eventSeq!: string;

  @Property({ type: 'uuid', nullable: true })
  promptId!: string | null;
}
