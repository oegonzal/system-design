import type { Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { QualityRun } from './quality-run.entity';
import { QualityRunIteration } from './quality-run-iteration.entity';

const RESULTS = [
  'pass',
  'partial',
  'fail',
  'not_applicable',
  'unassessed',
] as const satisfies readonly Contracts.EvidenceResult[];

type ContractLevels = (typeof Contracts)['AXIS_FACTOR_LEVELS'];
const LEVELS = ['none', 'low', 'medium', 'high'] as const satisfies ContractLevels;

/**
 * One criterion's evidence in one iteration's ledger (`ledger.criteria[position]`):
 * how the evaluators judged it, or `unassessed` when none did.
 */
@Entity()
@Unique({ properties: ['iteration', 'criterionId'] })
@Check({
  name: 'quality_run_criterion_result_result_check',
  expression: `result in (${RESULTS.map((r) => `'${r}'`).join(', ')})`,
})
@Check({
  name: 'quality_run_criterion_result_confidence_check',
  expression: `confidence is null or confidence in (${LEVELS.map((l) => `'${l}'`).join(', ')})`,
})
export class QualityRunCriterionResult {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @ManyToOne(() => QualityRunIteration, { deleteRule: 'cascade' })
  iteration!: Rel<QualityRunIteration>;

  @Index()
  @ManyToOne(() => QualityRun, { deleteRule: 'cascade' })
  run!: Rel<QualityRun>;

  /** Index within `ledger.criteria` — the reassembly order. */
  @Property({ type: 'integer' })
  position!: number;

  @Property({ type: 'varchar', length: 20 })
  criterionId!: string;

  @Property({ type: 'varchar', length: 60 })
  kind!: string;

  @Property({ type: 'text' })
  result!: Contracts.EvidenceResult;

  @Property({ type: 'integer' })
  hits!: number;

  @Property({ type: 'text', nullable: true })
  confidence: Contracts.AxisFactorLevel | null = null;

  @Property({ type: 'string[]' })
  locationRefs: string[] = [];
}
