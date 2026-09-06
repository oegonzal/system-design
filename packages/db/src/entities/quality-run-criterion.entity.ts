import type { Rel } from '@mikro-orm/core';
import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

import { QualityRun } from './quality-run.entity';

/** `trace.contract.criteria[position]` — one derived success criterion of a run. */
@Entity()
@Unique({ properties: ['run', 'criterionId'] })
export class QualityRunCriterion {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @ManyToOne(() => QualityRun, { deleteRule: 'cascade' })
  run!: Rel<QualityRun>;

  /** Index within the contract — the reassembly order. */
  @Property({ type: 'integer' })
  position!: number;

  @Property({ type: 'varchar', length: 20 })
  criterionId!: string;

  @Property({ type: 'varchar', length: 60 })
  kind!: string;

  @Property({ type: 'text' })
  statement!: string;
}
