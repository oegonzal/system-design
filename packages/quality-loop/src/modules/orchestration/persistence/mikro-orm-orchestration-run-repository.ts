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
import { interruptedError, NEWEST_FIRST, presentFilters } from '../../runs/persistence/conventions';
import type { OrchestrationListQuery, OrchestrationRunRepository } from '../ports';
import { childrenOf, fromRow, toRow, type ChildRef } from './orchestration-run-mapper';

@Injectable()
export class MikroOrmOrchestrationRunRepository implements OrchestrationRunRepository {
  constructor(private readonly em: EntityManager) {}

  async open(record: OrchestrationRunDto): Promise<void> {
    const em = this.em.fork();
    const row = em.create(OrchestrationRun, toRow(record));
    for (const child of childrenOf(record)) addChild(em, row, child);
    await em.flush();
  }

  async update(record: OrchestrationRunDto): Promise<void> {
    const em = this.em.fork();
    const row = await running(em, record.orchestrationRunId);
    if (row === null) return;
    row.steps = record.steps;
    row.updatedAt = new Date();
    await this.syncChildren(em, row, record);
    await em.flush();
  }

  async close(record: OrchestrationRunDto): Promise<void> {
    const em = this.em.fork();
    const row = await running(em, record.orchestrationRunId);
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
    const where: FilterQuery<OrchestrationRun> = presentFilters({
      orchestrator: query.orchestrator,
      pipeline: query.pipeline,
      status: query.status,
    });
    const [rows, total] = await this.em.fork().findAndCount(OrchestrationRun, where, {
      limit: query.limit,
      offset: query.offset,
      orderBy: NEWEST_FIRST,
    });
    return [rows.map(fromRow), total];
  }

  async failInterrupted(): Promise<number> {
    const em = this.em.fork();
    const rows = await em.find(OrchestrationRun, { status: 'running' });
    const at = new Date();
    for (const row of rows) {
      row.status = 'failed';
      row.error = interruptedError('orchestration run');
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
    for (const ref of childrenOf(record)) {
      const child = known.get(`${ref.step}#${ref.ordinal}`);
      if (child === undefined) {
        addChild(em, row, ref);
      } else if (child.qualityRun?.id !== ref.runId) {
        child.qualityRun = em.getReference(QualityRun, ref.runId);
      }
    }
  }
}

/** The row, only while it is still running — a finished or swept one is never written again. */
const running = (em: EntityManager, id: string): Promise<OrchestrationRun | null> =>
  em.findOne(OrchestrationRun, { id, status: 'running' });

/** One child row, pointing at its quality run by reference. */
const addChild = (em: EntityManager, row: OrchestrationRun, { step, ordinal, runId }: ChildRef) =>
  em.create(OrchestrationRunChild, {
    run: row,
    step,
    ordinal,
    qualityRun: em.getReference(QualityRun, runId),
  });
