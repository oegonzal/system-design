import type { Rel } from '@mikro-orm/core';
import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { QualityRun } from './quality-run.entity';

/**
 * `trace.iterations[n]`, with the evidence ledger split: `ledger.criteria`
 * are `quality_run_criterion_result` rows, `ledger.findings` are
 * `quality_run_finding` rows, and the rest of the ledger sits here.
 * `validation` doubles as `ledger.validation` — the runner records one array.
 */
@Entity()
@Unique({ properties: ['run', 'iteration'] })
export class QualityRunIteration {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @ManyToOne(() => QualityRun, { deleteRule: 'cascade' })
  run!: Rel<QualityRun>;

  @Property({ type: 'integer' })
  iteration!: number;

  @Property({ type: 'text' })
  mode!: Contracts.IterationTrace['mode'];

  @Property({ type: 'json', nullable: true })
  artifact: unknown = null;

  @Property({ type: 'text', nullable: true })
  rendered: string | null = null;

  @Property({ type: 'json' })
  locations!: Contracts.ArtifactLocation[];

  @Property({ type: 'json' })
  validation!: Contracts.ValidationReport[];

  @Property({ type: 'json' })
  critics!: Contracts.LensOutcome<Contracts.CriticReport>[];

  @Property({ type: 'json' })
  evaluators!: Contracts.LensOutcome<Contracts.EvaluationReport>[];

  @Property({ type: 'boolean' })
  artifactPresent!: boolean;

  @Property({ type: 'json' })
  discarded!: Contracts.DiscardedItem[];

  @Property({ type: 'json' })
  diagnostics!: Contracts.Diagnostic[];

  @Property({ type: 'json' })
  decision!: Contracts.QualityControlDecision;

  @Property({ type: 'json' })
  remediations!: Contracts.RemediationNote[];

  @Property({ type: 'integer' })
  durationMs!: number;
}
