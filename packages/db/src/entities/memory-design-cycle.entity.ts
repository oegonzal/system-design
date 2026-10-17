import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractStatuses = (typeof Contracts)['MEMORY_DESIGN_CYCLE_STATUSES'];
const STATUSES = ['running', 'coached', 'stored', 'failed'] as const satisfies ContractStatuses;

/**
 * One memory-design cycle as the agentic-system service keeps it: the durable
 * state of one coach-and-learn pass over a studio session's canvas. `sessionId`
 * and the two run ids are plain columns, never foreign keys — the studio and
 * the quality loop are other services. Kept apart from their tables for the
 * same reason the job-application record is kept apart from the session's.
 */
@Entity()
@Index({ properties: ['sessionId'] })
@Index({ properties: ['startedAt'] })
@Check({
  name: 'memory_design_cycle_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class MemoryDesignCycle {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  /** The studio session whose canvas was designed. */
  @Property({ type: 'varchar', length: 80 })
  sessionId!: string;

  @Property({ type: 'varchar', length: 20 })
  status!: Contracts.MemoryDesignCycleStatus;

  /** The memory-architecture coach run; null until it starts. */
  @Property({ type: 'varchar', length: 80, nullable: true })
  designRunId: string | null = null;

  /** The memory-design orchestration that digested and stored the run; null until it starts. */
  @Property({ type: 'varchar', length: 80, nullable: true })
  orchestrationRunId: string | null = null;

  @Property({ type: 'text', nullable: true })
  note: string | null = null;

  @Property({ type: 'timestamptz' })
  startedAt!: Date;

  @Property({ type: 'timestamptz' })
  updatedAt!: Date;
}
