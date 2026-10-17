/**
 * A memory-design cycle as the service keeps it in memory and in the row: the
 * durable execution state of one coach-and-learn pass. The wire shape
 * (`MemoryDesignCycleDto`) and the status vocabulary are the contract's,
 * shared with the db entity that stores it; this is the domain shape, with
 * real `Date`s, and the mapping to the wire.
 */
import type { MemoryDesignCycleDto, MemoryDesignCycleStatus } from '@sysdesign/contracts';

export type { MemoryDesignCycleDto, MemoryDesignCycleStatus };

export interface MemoryDesignCycle {
  id: string;
  /** The cycle's subject key, derived from the goal it designs for. */
  sessionId: string;
  status: MemoryDesignCycleStatus;
  /** The memory-architecture coach run; null until it starts. */
  designRunId: string | null;
  /** The memory-design orchestration that digested and stored the run; null until it starts. */
  orchestrationRunId: string | null;
  /** Why it failed, or a note about where it got to; null otherwise. */
  note: string | null;
  startedAt: Date;
  updatedAt: Date;
}

/** The fields a running cycle advances through; `id`, `sessionId` and `startedAt` never change. */
export type CyclePatch = Partial<
  Pick<MemoryDesignCycle, 'status' | 'designRunId' | 'orchestrationRunId' | 'note' | 'updatedAt'>
>;

export const cycleDto = (cycle: MemoryDesignCycle): MemoryDesignCycleDto => ({
  id: cycle.id,
  sessionId: cycle.sessionId,
  status: cycle.status,
  designRunId: cycle.designRunId,
  orchestrationRunId: cycle.orchestrationRunId,
  note: cycle.note,
  startedAt: cycle.startedAt.toISOString(),
  updatedAt: cycle.updatedAt.toISOString(),
});
