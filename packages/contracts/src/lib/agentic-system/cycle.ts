import type { IsoDateString, Uuid } from '../primitives';
import type { MemoryDesignCycleStatus } from './vocab';

/**
 * One memory-design cycle as the service answers it. `sessionId` is the studio
 * session whose canvas was designed — a plain reference, since the studio is
 * another service. `designRunId` is the memory-architecture coach run;
 * `orchestrationRunId` the memory-design orchestration that digested and stored
 * it. Both are null until their step starts.
 */
export interface MemoryDesignCycleDto {
  id: Uuid;
  sessionId: string;
  status: MemoryDesignCycleStatus;
  designRunId: string | null;
  orchestrationRunId: string | null;
  note: string | null;
  startedAt: IsoDateString;
  updatedAt: IsoDateString;
}
