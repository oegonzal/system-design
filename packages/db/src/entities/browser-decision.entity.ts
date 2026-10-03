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

import { BrowserSession } from './browser-session.entity';
import { BrowserTask } from './browser-task.entity';

type ContractKinds = (typeof Contracts)['BROWSER_DECISION_KINDS'];
const KINDS = ['step-plan', 'field-answer', 'termination'] as const satisfies ContractKinds;

type ContractSources = (typeof Contracts)['BROWSER_DECISION_SOURCES'];
const SOURCES = [
  'loop',
  'memory',
  'operator',
  'blank',
  'engine',
] as const satisfies ContractSources;

type ContractConfidences = (typeof Contracts)['CONFIDENCE_LEVELS'];
const CONFIDENCES = ['high', 'medium', 'low'] as const satisfies ContractConfidences;

/**
 * One decision the session acted on: a plan for a page, an answer for a
 * field, or the end of the session. Keyed by step and ordinal within the
 * session — a page yields one plan and then one row per field it asked about
 * — so the pair is a stable address and a replay reads the rows in the order
 * they were taken.
 *
 * `source` says who decided; the loop ids say which run or orchestration did,
 * held as plain ids rather than foreign keys because the loop is another
 * service that happens to share this database and its rows may be swept
 * independently. `question` is the field's label: the join key for "was this
 * asked before, and was it later answered from memory" — the learning curve
 * the package README queries. `payload` is the decision's own shape (a plan's
 * page kind and outcome, a field's route, basis aliases and findings), kept
 * open so a new decision kind needs no column.
 *
 * `task` is set-null on delete: a decision outlives the unit it was taken in.
 */
@Entity()
@Unique({ properties: ['session', 'step', 'ordinal'] })
@Check({
  name: 'browser_decision_kind_check',
  expression: `kind in (${KINDS.map((k) => `'${k}'`).join(', ')})`,
})
@Check({
  name: 'browser_decision_source_check',
  expression: `source in (${SOURCES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'browser_decision_confidence_check',
  expression: `confidence is null or confidence in (${CONFIDENCES.map((c) => `'${c}'`).join(', ')})`,
})
export class BrowserDecision {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Index()
  @ManyToOne(() => BrowserSession, { deleteRule: 'cascade' })
  session!: Rel<BrowserSession>;

  /** The unit of work open when the decision was taken; null outside any. */
  @ManyToOne(() => BrowserTask, { nullable: true, deleteRule: 'set null' })
  task: Rel<BrowserTask> | null = null;

  /** The session step (one observed page) the decision belongs to. */
  @Property({ type: 'integer' })
  step!: number;

  /** The decision's position within its step: the plan first, then one per field. */
  @Property({ type: 'integer' })
  ordinal!: number;

  @Property({ type: 'text' })
  kind!: Contracts.BrowserDecisionKind;

  @Property({ type: 'text' })
  source!: Contracts.BrowserDecisionSource;

  /** The quality run that decided; not a foreign key — the loop is another service. */
  @Index()
  @Property({ type: 'varchar', length: 80, nullable: true })
  loopRunId: string | null = null;

  /** The orchestration that ran the deciding run, when one did. */
  @Property({ type: 'varchar', length: 80, nullable: true })
  loopOrchestrationId: string | null = null;

  /** The document-memory orchestration an operator's answer was taught through. */
  @Property({ type: 'varchar', length: 80, nullable: true })
  teachOrchestrationId: string | null = null;

  /** The element ref the decision targeted, for a field. */
  @Property({ type: 'text', nullable: true })
  ref: string | null = null;

  /** The field's label — the join key for "was this asked before". */
  @Index()
  @Property({ type: 'text', nullable: true })
  question: string | null = null;

  @Property({ type: 'text', nullable: true })
  answer: string | null = null;

  /** The producer's stated confidence in a field answer; null for anything else. */
  @Property({ type: 'text', nullable: true })
  confidence: Contracts.ConfidenceLevel | null = null;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  /** How long the decision took to reach, run included; null when nothing was awaited. */
  @Property({ type: 'integer', nullable: true })
  durationMs: number | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
