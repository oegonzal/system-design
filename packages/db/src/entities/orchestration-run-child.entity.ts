import type { Rel } from '@mikro-orm/core';
import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { OrchestrationRun } from './orchestration-run.entity';
import { QualityRun } from './quality-run.entity';

/**
 * One child quality run of an orchestration, by step and ordinal. Normalised
 * rather than a column per step, so any orchestrator's children fit and each
 * is joinable and indexable; the ordinal is the child's position among the
 * step's children, so a step that runs a pipeline several times keeps every
 * one. The reference is nullable and set-null on delete: a child removed
 * later leaves the ledger's row standing.
 */
@Entity()
@Unique({ properties: ['run', 'step', 'ordinal'] })
export class OrchestrationRunChild {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @ManyToOne(() => OrchestrationRun, { deleteRule: 'cascade' })
  run!: Rel<OrchestrationRun>;

  @Property({ type: 'varchar', length: 80 })
  step!: string;

  @Property({ type: 'int' })
  ordinal = 0;

  @Index()
  @ManyToOne(() => QualityRun, { nullable: true, deleteRule: 'set null' })
  qualityRun: Rel<QualityRun> | null = null;
}
