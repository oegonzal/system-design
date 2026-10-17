import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MemoryDesignCycle as CycleRow } from '@sysdesign/db';

import type { CyclePatch, MemoryDesignCycle } from '../cycle';
import type { CycleStore } from '../ports';

/** Cycles in Postgres: one row per cycle, each operation on a fork of its own. The entity is aliased `CycleRow` so it does not shadow the domain shape. */
@Injectable()
export class MikroOrmCycleStore implements CycleStore {
  constructor(private readonly em: EntityManager) {}

  async insert(cycle: MemoryDesignCycle): Promise<void> {
    const em = this.em.fork();
    em.create(CycleRow, { ...cycle });
    await em.flush();
  }

  async find(id: string): Promise<MemoryDesignCycle | null> {
    const row = await this.em.fork().findOne(CycleRow, { id });
    return row === null ? null : cycleOf(row);
  }

  async update(id: string, patch: CyclePatch): Promise<MemoryDesignCycle | null> {
    const em = this.em.fork();
    const row = await em.findOne(CycleRow, { id });
    if (row === null) return null;
    em.assign(row, patch);
    await em.flush();
    return cycleOf(row);
  }
}

const cycleOf = (row: CycleRow): MemoryDesignCycle => ({
  id: row.id,
  goalDigest: row.goalDigest,
  status: row.status,
  designRunId: row.designRunId,
  orchestrationRunId: row.orchestrationRunId,
  note: row.note,
  startedAt: row.startedAt,
  updatedAt: row.updatedAt,
});
