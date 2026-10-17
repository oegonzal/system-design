import { Injectable } from '@nestjs/common';

import type { CyclePatch, MemoryDesignCycle } from '../cycle';
import type { CycleStore } from '../ports';

/**
 * Cycles in memory. The phase-one adapter, used until the `memory_design_cycle`
 * table lands; it holds copies in and out so a caller can never mutate a stored
 * row, which is the one property the MikroORM adapter must also keep.
 */
@Injectable()
export class InMemoryCycleStore implements CycleStore {
  private readonly rows = new Map<string, MemoryDesignCycle>();

  insert(cycle: MemoryDesignCycle): Promise<void> {
    this.rows.set(cycle.id, { ...cycle });
    return Promise.resolve();
  }

  find(id: string): Promise<MemoryDesignCycle | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : { ...row });
  }

  update(id: string, patch: CyclePatch): Promise<MemoryDesignCycle | null> {
    const row = this.rows.get(id);
    if (row === undefined) return Promise.resolve(null);
    const merged = { ...row, ...patch };
    this.rows.set(id, merged);
    return Promise.resolve({ ...merged });
  }

  listBySession(sessionId: string): Promise<MemoryDesignCycle[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.sessionId === sessionId)
        .map((row) => ({ ...row })),
    );
  }
}
