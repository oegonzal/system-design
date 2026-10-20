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

type ContractRoles = (typeof Contracts)['TRANSCRIPT_ROLES'];
const ROLES = ['interviewer', 'candidate'] as const satisfies ContractRoles;

/**
 * One turn of an interview session: what the candidate asked or answered,
 * or what the interviewer said. An interviewer turn is answered by a
 * quality-loop run of the `interview-turn` pipeline and claimed once by that
 * run's id — the unique `runId` is what makes a concurrent poll claim it
 * exactly once — with the judges' decision kept beside the text. The
 * transcript a revision carries is composed from these rows in ordinal order.
 */
@Entity()
@Unique({ properties: ['session', 'ordinal'] })
@Check({
  name: 'interview_turn_role_check',
  expression: `role in (${ROLES.map((r) => `'${r}'`).join(', ')})`,
})
export class InterviewTurn {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Index()
  @ManyToOne(() => DesignSession, { deleteRule: 'cascade' })
  session!: Rel<DesignSession>;

  /** 1-based, in the order the turns were taken; the transcript's `turn.N`. */
  @Property({ type: 'integer' })
  ordinal!: number;

  /** The format's phase the turn was taken in. */
  @Property({ type: 'text' })
  phase!: string;

  @Property({ type: 'text' })
  role!: Contracts.TranscriptRole;

  /** Empty until an interviewer turn's reply is claimed. */
  @Property({ type: 'text' })
  text: Opt<string> = '';

  /** The rubric criteria the reply gave away, by id. */
  @Property({ type: 'json' })
  disclosedCriterionIds: Opt<string[]> = [];

  /** The loop run answering an interviewer turn; null for the candidate's own. */
  @Unique()
  @Property({ type: 'varchar', length: 80, nullable: true })
  runId: string | null = null;

  @Property({ type: 'text', nullable: true })
  decision: Contracts.Decision | null = null;

  @Property({ type: 'double', nullable: true })
  overall: number | null = null;

  /** When the reply was claimed from its run; null while pending, and for a candidate turn. */
  @Property({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
