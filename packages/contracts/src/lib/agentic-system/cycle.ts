import type { IsoDateString, Uuid } from '../primitives';
import type { MemoryDesignCycleStatus } from './vocab';

/**
 * One memory-design cycle as the service answers it. `goalDigest` names the
 * brief the cycle designs for by its digest — the brief itself is read from the
 * coach run — so cycles over the same brief share it. `designRunId` is the
 * memory-architecture coach run, whose best iteration holds the strategy;
 * `orchestrationRunId` the memory-design orchestration that digested and stored
 * it. Both are null until their step starts.
 */
export interface MemoryDesignCycleDto {
  id: Uuid;
  goalDigest: string;
  status: MemoryDesignCycleStatus;
  designRunId: string | null;
  orchestrationRunId: string | null;
  note: string | null;
  startedAt: IsoDateString;
  updatedAt: IsoDateString;
}
