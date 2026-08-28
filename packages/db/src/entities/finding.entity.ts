import type { Opt, Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { Evaluation } from './evaluation.entity';

type ContractSources = (typeof Contracts)['FINDING_SOURCES'];
const SOURCES = ['rule', 'llm'] as const satisfies ContractSources;

type ContractDimensions = (typeof Contracts)['EVAL_DIMENSIONS'];
const DIMENSIONS = [
  'reliability',
  'scalability',
  'performance',
  'data',
  'messaging',
  'security',
  'hygiene',
] as const satisfies ContractDimensions;

type ContractSeverities = (typeof Contracts)['SEVERITIES'];
const SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const satisfies ContractSeverities;

/** One issue the engine or the critic found in a revision's graph. */
@Entity()
@Check({
  name: 'finding_source_check',
  expression: `source in (${SOURCES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'finding_dimension_check',
  expression: `dimension in (${DIMENSIONS.map((d) => `'${d}'`).join(', ')})`,
})
@Check({
  name: 'finding_severity_check',
  expression: `severity in (${SEVERITIES.map((s) => `'${s}'`).join(', ')})`,
})
export class Finding {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Index()
  @ManyToOne(() => Evaluation, { deleteRule: 'cascade' })
  evaluation!: Rel<Evaluation>;

  @Property({ type: 'text' })
  source!: Contracts.FindingSource;

  /** Stable engine rule id; null when the critic (LLM) produced the finding. */
  @Property({ type: 'varchar', length: 60, nullable: true })
  ruleId: string | null = null;

  @Property({ type: 'text' })
  dimension!: Contracts.EvalDimension;

  @Property({ type: 'text' })
  severity!: Contracts.Severity;

  @Property({ type: 'varchar', length: 120 })
  title!: string;

  @Property({ type: 'text' })
  message!: string;

  @Property({ type: 'string[]' })
  affectedNodeIds: string[] = [];

  @Property({ type: 'string[]' })
  affectedEdgeIds: string[] = [];

  @Property({ type: 'json', nullable: true })
  suggestion: Contracts.GraphPatch | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
