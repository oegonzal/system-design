import type { Opt, Rel } from '@mikro-orm/core';
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

import { DesignSession } from './design-session.entity';

type ContractOrigins = (typeof Contracts)['REVISION_ORIGINS'];
const ORIGINS = ['user', 'assistant'] as const satisfies ContractOrigins;

type ContractDecisions = (typeof Contracts)['DECISIONS'];
const DECISIONS = [
  'accept',
  'revise',
  'retry',
  'escalate',
  'reject',
] as const satisfies ContractDecisions;

type ContractStatuses = (typeof Contracts)['QUALITY_RUN_STATUSES'];
const STATUSES = ['running', 'complete', 'failed'] as const satisfies ContractStatuses;

/**
 * An immutable snapshot of the canvas at submit time. No `updatedAt` on
 * purpose: a revision is history, and history does not change — iteration
 * happens by submitting the next revision.
 *
 * Its grade lives in the quality loop: `qualityRunId` + `qualityIteration`
 * name the one iteration of the one run that judged this design (a
 * submission is iteration 1 of its own run; a coach revision is iteration k
 * of the coaching run). The unique pair is what makes importing a coach
 * iteration idempotent. `overall`, `decision` and `evaluationStatus` are a
 * cache of the last terminal read of that run, so lists never fetch the loop.
 * Not a foreign key: the loop is a separate service that happens to share
 * this database.
 *
 * `Rel<DesignSession>` breaks the circular-import TDZ crash under
 * `emitDecoratorMetadata` (session ↔ revision import each other): the
 * metadata serialises to `Object` while the relation still resolves through
 * the lazy `() => DesignSession`.
 */
@Entity()
@Unique({ properties: ['session', 'revisionNumber'] })
@Unique({ properties: ['qualityRunId', 'qualityIteration'] })
@Check({
  name: 'design_revision_origin_check',
  expression: `origin in (${ORIGINS.map((o) => `'${o}'`).join(', ')})`,
})
@Check({
  name: 'design_revision_decision_check',
  expression: `decision is null or decision in (${DECISIONS.map((d) => `'${d}'`).join(', ')})`,
})
@Check({
  name: 'design_revision_evaluation_status_check',
  expression: `evaluation_status is null or evaluation_status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class DesignRevision {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** cascade: a deleted session's snapshots are meaningless on their own. */
  @Index()
  @ManyToOne(() => DesignSession, { deleteRule: 'cascade' })
  session!: Rel<DesignSession>;

  /** 1-indexed, dense per session — assigned as max + 1 inside the submit transaction. */
  @Property({ type: 'integer' })
  revisionNumber!: number;

  /** Who authored this snapshot: the user, or the coach's revise iteration. */
  @Property({ type: 'text' })
  origin: Opt<Contracts.RevisionOrigin> = 'user';

  @Property({ type: 'json' })
  graph!: Contracts.CanvasGraph;

  @Property({ type: 'json', nullable: true })
  brief: Contracts.DesignBrief | null = null;

  @Property({ type: 'json', nullable: true })
  narrative: Contracts.DesignNarrative | null = null;

  /** The data model beside the diagram; null for a revision stored before models existed or written without one. */
  @Property({ type: 'json', nullable: true })
  model: Contracts.DesignModel | null = null;

  /** The quality loop's run id; null only for revisions stored before grading was delegated. */
  @Index()
  @Property({ type: 'varchar', length: 80, nullable: true })
  qualityRunId: string | null = null;

  @Property({ type: 'integer', nullable: true })
  qualityIteration: number | null = null;

  @Property({ type: 'double', nullable: true })
  overall: number | null = null;

  @Property({ type: 'text', nullable: true })
  decision: Contracts.Decision | null = null;

  @Property({ type: 'text', nullable: true })
  evaluationStatus: Contracts.QualityRunStatus | null = null;

  /**
   * Why the studio itself called the grade off, in the author's terms —
   * the grader no longer has the run — beside the `failed` it cached for it.
   * Null for every grade the grader reported, and cleared when the revision
   * is graded again.
   */
  @Property({ type: 'text', nullable: true })
  evaluationError: string | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
