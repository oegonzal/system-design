import { Check, Entity, Index, OneToOne, Property } from '@mikro-orm/decorators/legacy';
import type { Rel } from '@mikro-orm/core';
import type * as Contracts from '@sysdesign/contracts';

import { GovconOpportunity } from './govcon-opportunity.entity';

type ContractStages = (typeof Contracts)['BID_STAGES'];
const STAGES = [
  'watching',
  'qualifying',
  'preparing',
  'submitted',
  'won',
  'lost',
  'passed',
] as const satisfies ContractStages;

/**
 * One notice's place in the bid pipeline: at most one row per stored
 * notice, keyed by it and gone with it. The stage is the package's own
 * vocabulary, so it backs a check; `stage_changed_at` moves only when the
 * stage does, so "how long has this sat in preparing" is one subtraction.
 */
@Entity()
@Index({ properties: ['stage'] })
@Index({
  name: 'govcon_bid_reminder_index',
  expression:
    'create index "govcon_bid_reminder_index" on "govcon_bid" ("reminder_at") where reminder_at is not null',
})
@Check({
  name: 'govcon_bid_stage_check',
  expression: `stage in (${STAGES.map((s) => `'${s}'`).join(', ')})`,
})
export class GovconBid {
  @OneToOne(() => GovconOpportunity, {
    primary: true,
    deleteRule: 'cascade',
    fieldName: 'notice_id',
  })
  notice!: Rel<GovconOpportunity>;

  @Property({ type: 'varchar', length: 20 })
  stage!: Contracts.BidStage;

  @Property({ type: 'text' })
  notes!: string;

  @Property({ type: 'timestamptz', nullable: true })
  reminderAt!: Date | null;

  @Property({ type: 'numeric', precision: 16, scale: 2, nullable: true })
  estimatedValue!: string | null;

  @Property({ type: 'timestamptz' })
  stageChangedAt!: Date;

  @Property({ type: 'timestamptz' })
  createdAt!: Date;

  @Property({ type: 'timestamptz' })
  updatedAt!: Date;
}
