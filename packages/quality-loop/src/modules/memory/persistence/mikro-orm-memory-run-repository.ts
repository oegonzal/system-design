/**
 * The memory-run record in Postgres. Every method forks the root
 * EntityManager (the run performs in the background, outside any request
 * context); writes after `open` are guarded by `status: 'running'`, so a late
 * flush never resurrects a row the boot sweep already failed.
 */
import { Injectable } from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import type { MemoryRunDto, MemoryStep, MemoryStepDto } from '@sysdesign/contracts';
import { MemoryRun, QualityRun } from '@sysdesign/db';

import type { RunListQuery } from '../../../core/ports';
import type { MemoryRunRepository } from '../ports';
import { childIds, fromRow, toRow } from './memory-run-mapper';

const INTERRUPTED = {
  name: 'Interrupted',
  message: 'the service restarted while the memory run was in flight',
  stack: null,
};

/** What the sweep leaves of a step: running → failed, pending → skipped, both `interrupted`. */
export const sweepSteps = (
  steps: Record<MemoryStep, MemoryStepDto>,
  at: string,
): Record<MemoryStep, MemoryStepDto> =>
  Object.fromEntries(
    Object.entries(steps).map(([step, dto]) => [
      step,
      dto.status === 'running'
        ? { ...dto, status: 'failed', reason: 'interrupted', finishedAt: at }
        : dto.status === 'pending'
          ? { ...dto, status: 'skipped', reason: 'interrupted', finishedAt: at }
          : dto,
    ]),
  ) as Record<MemoryStep, MemoryStepDto>;

@Injectable()
export class MikroOrmMemoryRunRepository implements MemoryRunRepository {
  constructor(private readonly em: EntityManager) {}

  async open(record: MemoryRunDto): Promise<void> {
    const em = this.em.fork();
    const { recallRun, targetRun, digestRun, ...row } = toRow(record);
    em.create(MemoryRun, {
      ...row,
      recallRun: this.reference(em, recallRun),
      targetRun: this.reference(em, targetRun),
      digestRun: this.reference(em, digestRun),
    });
    await em.flush();
  }

  async update(record: MemoryRunDto): Promise<void> {
    await this.em
      .fork()
      .nativeUpdate(
        MemoryRun,
        { id: record.memoryRunId, status: 'running' },
        { steps: record.steps, ...childIds(record), updatedAt: new Date() },
      );
  }

  async close(record: MemoryRunDto): Promise<void> {
    const row = toRow(record);
    await this.em.fork().nativeUpdate(
      MemoryRun,
      { id: record.memoryRunId, status: 'running' },
      {
        status: row.status,
        steps: row.steps,
        ...childIds(record),
        error: row.error,
        finishedAt: row.finishedAt,
        updatedAt: new Date(),
      },
    );
  }

  async find(memoryRunId: string): Promise<MemoryRunDto | null> {
    const row = await this.em.fork().findOne(MemoryRun, { id: memoryRunId });
    return row === null ? null : fromRow(row);
  }

  async list(query: RunListQuery): Promise<[MemoryRunDto[], number]> {
    const where: FilterQuery<MemoryRun> = {
      ...(query.pipeline ? { pipeline: query.pipeline } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.em.fork().findAndCount(MemoryRun, where, {
      limit: query.limit,
      offset: query.offset,
      orderBy: { startedAt: 'desc', id: 'desc' },
    });
    return [rows.map(fromRow), total];
  }

  async failInterrupted(): Promise<number> {
    const em = this.em.fork();
    const rows = await em.find(MemoryRun, { status: 'running' });
    const at = new Date();
    for (const row of rows) {
      row.status = 'failed';
      row.error = INTERRUPTED;
      row.steps = sweepSteps(row.steps, at.toISOString());
      row.finishedAt = at;
    }
    await em.flush();
    return rows.length;
  }

  private reference(em: EntityManager, id: string | null): QualityRun | null {
    return id === null ? null : em.getReference(QualityRun, id);
  }
}
