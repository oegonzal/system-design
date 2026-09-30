/**
 * The orchestration-run record in Postgres. Every method forks the root
 * EntityManager (the run performs in the background, outside any request
 * context); writes after `open` are guarded by `status: 'running'`, so a late
 * flush never resurrects a row the boot sweep already failed. Children are
 * one row per run id a step opened, keyed by step and ordinal, upserted as
 * the ledger learns them and never removed: a child id, once known, stays
 * known.
 */
import { Injectable } from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import type { OrchestrationRunDto } from '@sysdesign/contracts';
import { OrchestrationRun, OrchestrationRunChild, QualityRun } from '@sysdesign/db';

import { closeSteps } from '../../../orchestrators/runner/record';
import type { OrchestrationListQuery, OrchestrationRunRepository } from '../ports';
import { childrenOf, fromRow, toRow } from './orchestration-run-mapper';

const INTERRUPTED = {
  name: 'Interrupted',
  message: 'the service restarted while the orchestration run was in flight',
  stack: null,
};

@Injectable()
export class MikroOrmOrchestrationRunRepository implements OrchestrationRunRepository {
  constructor(private readonly em: EntityManager) {}

  async open(record: OrchestrationRunDto): Promise<void> {
    const em = this.em.fork();
    const row = em.create(OrchestrationRun, toRow(record));
    for (const { step, ordinal, runId } of childrenOf(record)) {
      em.create(OrchestrationRunChild, {
        run: row,
        step,
        ordinal,
        qualityRun: em.getReference(QualityRun, runId),
      });
    }
    await em.flush();
  }

  async update(record: OrchestrationRunDto): Promise<void> {
    const em = this.em.fork();
    const row = await em.findOne(OrchestrationRun, {
      id: record.orchestrationRunId,
      status: 'running',
    });
    if (row === null) return;
    row.steps = record.steps;
    row.updatedAt = new Date();
    await this.syncChildren(em, row, record);
    await em.flush();
  }

  async close(record: OrchestrationRunDto): Promise<void> {
    const em = this.em.fork();
    const row = await em.findOne(OrchestrationRun, {
      id: record.orchestrationRunId,
      status: 'running',
    });
    if (row === null) return;
    const next = toRow(record);
    row.status = next.status;
    row.steps = next.steps;
    row.error = next.error;
    row.finishedAt = next.finishedAt;
    row.updatedAt = new Date();
    await this.syncChildren(em, row, record);
    await em.flush();
  }

  async find(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    const row = await this.em.fork().findOne(OrchestrationRun, { id: orchestrationRunId });
    return row === null ? null : fromRow(row);
  }

  async list(query: OrchestrationListQuery): Promise<[OrchestrationRunDto[], number]> {
    const where: FilterQuery<OrchestrationRun> = {
      ...(query.orchestrator ? { orchestrator: query.orchestrator } : {}),
      ...(query.pipeline ? { pipeline: query.pipeline } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.em.fork().findAndCount(OrchestrationRun, where, {
      limit: query.limit,
      offset: query.offset,
      orderBy: { startedAt: 'desc', id: 'desc' },
    });
    return [rows.map(fromRow), total];
  }

  async failInterrupted(): Promise<number> {
    const em = this.em.fork();
    const rows = await em.find(OrchestrationRun, { status: 'running' });
    const at = new Date();
    for (const row of rows) {
      row.status = 'failed';
      row.error = INTERRUPTED;
      row.steps = closeSteps(row.steps, 'interrupted', null, at.toISOString());
      row.finishedAt = at;
    }
    await em.flush();
    return rows.length;
  }

  private async syncChildren(
    em: EntityManager,
    row: OrchestrationRun,
    record: OrchestrationRunDto,
  ): Promise<void> {
    const existing = await em.find(OrchestrationRunChild, { run: row.id });
    const known = new Map(existing.map((child) => [`${child.step}#${child.ordinal}`, child]));
    for (const { step, ordinal, runId } of childrenOf(record)) {
      const child = known.get(`${step}#${ordinal}`);
      if (child === undefined) {
        em.create(OrchestrationRunChild, {
          run: row,
          step,
          ordinal,
          qualityRun: em.getReference(QualityRun, runId),
        });
      } else if (child.qualityRun?.id !== runId) {
        child.qualityRun = em.getReference(QualityRun, runId);
      }
    }
  }
}
