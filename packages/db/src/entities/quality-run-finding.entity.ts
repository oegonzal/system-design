import type { Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { QualityRun } from './quality-run.entity';
import { QualityRunIteration } from './quality-run-iteration.entity';

type ContractSeverities = (typeof Contracts)['SEVERITIES'];
const SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const satisfies ContractSeverities;

type ContractLevels = (typeof Contracts)['AXIS_FACTOR_LEVELS'];
const LEVELS = ['none', 'low', 'medium', 'high'] as const satisfies ContractLevels;

type ContractFixabilities = (typeof Contracts)['FIXABILITIES'];
const FIXABILITIES = [
  'fixable_local',
  'requires_retry',
  'requires_user',
  'unfixable',
] as const satisfies ContractFixabilities;

/**
 * One confirmed finding of one iteration's evidence ledger
 * (`ledger.findings[position]`). `run` is denormalised beside `iteration` so
 * "every high finding of type X across runs" is one indexed scan.
 */
@Entity()
@Index({ properties: ['run', 'type'] })
@Index({ properties: ['run', 'severity'] })
@Check({
  name: 'quality_run_finding_severity_check',
  expression: `severity in (${SEVERITIES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'quality_run_finding_confidence_check',
  expression: `confidence in (${LEVELS.map((l) => `'${l}'`).join(', ')})`,
})
@Check({
  name: 'quality_run_finding_fixability_check',
  expression: `fixability in (${FIXABILITIES.map((f) => `'${f}'`).join(', ')})`,
})
export class QualityRunFinding {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Index()
  @ManyToOne(() => QualityRunIteration, { deleteRule: 'cascade' })
  iteration!: Rel<QualityRunIteration>;

  @ManyToOne(() => QualityRun, { deleteRule: 'cascade' })
  run!: Rel<QualityRun>;

  /** Index within `ledger.findings` — the reassembly order. */
  @Property({ type: 'integer' })
  position!: number;

  /** `${type}|${sorted locationRefs}` — structural, wording-independent. */
  @Property({ type: 'text' })
  key!: string;

  @Property({ type: 'varchar', length: 60 })
  type!: string;

  @Property({ type: 'text' })
  severity!: Contracts.Severity;

  @Property({ type: 'text' })
  confidence!: Contracts.AxisFactorLevel;

  @Property({ type: 'text' })
  fixability!: Contracts.Fixability;

  @Property({ type: 'string[]' })
  locationRefs: string[] = [];

  @Property({ type: 'string[]' })
  criterionIds: string[] = [];

  @Property({ type: 'integer' })
  hits!: number;

  @Property({ type: 'string[]' })
  lenses: string[] = [];

  /** The first rationale a confirming lens gave — prose for a reader, never for the policy. */
  @Property({ type: 'text', nullable: true })
  rationale: string | null = null;

  @Property({ type: 'varchar', length: 20, nullable: true })
  reconciledTo: string | null = null;
}
