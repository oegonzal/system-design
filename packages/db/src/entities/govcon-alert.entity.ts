import { Check, Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractKinds = (typeof Contracts)['ALERT_KINDS'];
const KINDS = ['award-ending', 'pulse-above-band'] as const satisfies ContractKinds;

/**
 * One alert the spending warm raised, by the key that makes it the same alert
 * tomorrow or in another scope — its kind and its subject — so a warm raises
 * each once; `scope_key` is where it was first found. `event_seq` is the bus's receipt for the published
 * event; `prompt_id` the digest it was listed in, null when the digest could
 * not be published. Rows are only ever written for what was published.
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
  @Property({ type: 'varchar', length: 64 })
  scopeKey!: string;

  @Property({ type: 'varchar', length: 40 })
  profileId!: string;

  @Property({ type: 'timestamptz' })
  raisedAt!: Date;

  @Property({ type: 'text' })
  eventSeq!: string;

  @Property({ type: 'uuid', nullable: true })
  promptId!: string | null;
}
