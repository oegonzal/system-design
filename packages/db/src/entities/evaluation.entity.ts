import type { Opt, Rel } from '@mikro-orm/core';
import { Collection } from '@mikro-orm/core';
import {
  Check,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { DesignRevision } from './design-revision.entity';
import { Finding } from './finding.entity';

type ContractStatuses = (typeof Contracts)['EVAL_STATUSES'];
const STATUSES = ['queued', 'running', 'complete', 'failed'] as const satisfies ContractStatuses;

type ContractGrades = (typeof Contracts)['GRADES'];
const GRADES = ['A', 'B', 'C', 'D', 'F'] as const satisfies ContractGrades;

/**
 * The graded result for exactly one revision (unique FK). Created in the
 * `queued` state inside the submit transaction; the eval worker moves it
 * through `running` to `complete`/`failed`. A retry re-runs in place rather
 * than inserting a second row, so "the evaluation for revision X" is always
 * one query with one answer.
 */
@Entity()
@Unique({ properties: ['revision'] })
@Check({
  name: 'evaluation_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'evaluation_grade_check',
  expression: `grade is null or grade in (${GRADES.map((g) => `'${g}'`).join(', ')})`,
})
export class Evaluation {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @ManyToOne(() => DesignRevision, { deleteRule: 'cascade' })
  revision!: Rel<DesignRevision>;

  @Property({ type: 'text' })
  status: Opt<Contracts.EvalStatus> = 'queued';

  /** 0–100. Double precision, not numeric: JS numbers in, JS numbers out. */
  @Property({ type: 'double', nullable: true })
  overallScore: number | null = null;

  @Property({ type: 'text', nullable: true })
  grade: Contracts.Grade | null = null;

  @Property({ type: 'json', nullable: true })
  dimensionScores: Contracts.DimensionScores | null = null;

  @Property({ type: 'text', nullable: true })
  summary: string | null = null;

  @Property({ type: 'varchar', length: 20, nullable: true })
  engineVersion: string | null = null;

  /** The rubric that produced this grade — audit across profile evolution. */
  @Property({ type: 'varchar', length: 40, nullable: true })
  profileId: string | null = null;

  @Property({ type: 'varchar', length: 20, nullable: true })
  profileVersion: string | null = null;

  /** Set when critical findings lowered the letter below its numeric band. */
  @Property({ type: 'json', nullable: true })
  capApplied: Contracts.CapAppliedDto | null = null;

  /**
   * The full ordered evidence-artifact list the aggregator decided from —
   * the audit trail for "why this grade". Opaque to the API by design.
   */
  @Property({ type: 'json', nullable: true })
  evidence: unknown[] | null = null;

  /** LLM-scored axes, displayed beside the deterministic score. */
  @Property({ type: 'json', nullable: true })
  axes: Contracts.EvalAxisDto[] | null = null;

  /** Adversarial scenario narrations from the scenario pass. */
  @Property({ type: 'json', nullable: true })
  scenarios: Contracts.ScenarioReportDto[] | null = null;

  @Property({ type: 'varchar', length: 60, nullable: true })
  criticModel: string | null = null;

  @Property({ type: 'text', nullable: true })
  error: string | null = null;

  @OneToMany(() => Finding, (finding) => finding.evaluation)
  findings = new Collection<Finding>(this);

  @Property({ type: 'timestamptz', nullable: true })
  startedAt: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  completedAt: Date | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
