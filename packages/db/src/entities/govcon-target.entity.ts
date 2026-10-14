import { Check, Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractKinds = (typeof Contracts)['TARGET_KINDS'];
const KINDS = ['firm', 'award'] as const satisfies ContractKinds;

type ContractStages = (typeof Contracts)['TARGET_STAGES'];
const STAGES = {
  firm: ['identified', 'contacted', 'talking', 'teamed', 'passed'],
  award: ['watching', 'researching', 'positioning', 'pursuing', 'passed'],
} as const satisfies ContractStages;

const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * Something the company pursues that is not a notice: a firm to work with,
 * or an award whose work may be bought again. A bid's sibling, keyed by what
 * it is about — its kind and its subject, a UEI or an award's id — so a
 * thing is tracked once. Each kind has its own stages, so the check reads
 * the two together; `stage_changed_at` moves only when the stage does.
 * `ends_at` is an award's end as the daily warm last read it: what the next
 * warm compares against to say the end moved.
 */
@Entity()
@Unique({ properties: ['kind', 'subject'] })
@Index({
  name: 'govcon_target_reminder_index',
  expression:
    'create index "govcon_target_reminder_index" on "govcon_target" ("reminder_at") where reminder_at is not null',
})
@Check({
  name: 'govcon_target_kind_check',
  expression: `kind in (${quoted(KINDS)})`,
})
@Check({
  name: 'govcon_target_stage_check',
  expression: KINDS.map((kind) => `(kind = '${kind}' and stage in (${quoted(STAGES[kind])}))`).join(
    ' or ',
  ),
})
export class GovconTarget {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'varchar', length: 10 })
  kind!: Contracts.TargetKind;

  /** A firm's UEI, or an award's id at the source its record is read by. */
  @Property({ type: 'text' })
  subject!: string;

  @Property({ type: 'varchar', length: 200 })
  label!: string;

  @Property({ type: 'varchar', length: 20 })
  stage!: Contracts.TargetStage;

  @Property({ type: 'text' })
  notes!: string;

  @Property({ type: 'varchar', length: 300 })
  contact!: string;

  @Property({ type: 'timestamptz', nullable: true })
  reminderAt!: Date | null;

  @Property({ type: 'date', nullable: true })
  endsAt!: string | null;

  @Property({ type: 'timestamptz' })
  stageChangedAt!: Date;

  @Property({ type: 'timestamptz' })
  createdAt!: Date;

  @Property({ type: 'timestamptz' })
  updatedAt!: Date;
}
