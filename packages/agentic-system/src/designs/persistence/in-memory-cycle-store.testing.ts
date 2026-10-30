import { Injectable } from '@nestjs/common';

import type { CyclePatch, MemoryDesignCycle } from '../cycle';
import type { CycleStore } from '../ports';

/**
 * Cycles in memory, the store the service specs run on. It holds copies in and
 * out so a caller can never mutate a stored row — the one property the MikroORM
 * adapter keeps too.
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
}
