import type { CyclePatch, MemoryDesignCycle } from './cycle';

/** Where cycles live between requests and across restarts. */
export const CYCLE_STORE = Symbol('CYCLE_STORE');
export interface CycleStore {
  insert(cycle: MemoryDesignCycle): Promise<void>;
  find(id: string): Promise<MemoryDesignCycle | null>;
  /** Merge a patch into a standing cycle; the merged row, or null when there is none. */
  update(id: string, patch: CyclePatch): Promise<MemoryDesignCycle | null>;
  listBySession(sessionId: string): Promise<MemoryDesignCycle[]>;
}

/** Where a cycle's lifecycle is announced — the bus, in production. A no-op for a status with no event, and never fatal to the cycle. */
export const EVENT_SINK = Symbol('EVENT_SINK');
export interface DesignEventSink {
  emit(cycle: MemoryDesignCycle): Promise<void>;
}
