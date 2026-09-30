import { Injectable } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  LlmExchangeSummaryDto,
  QualityRunDto,
  QualityRunSummaryDto,
} from '@sysdesign/contracts';
import {
  QualityRun,
  QualityRunCriterion,
  QualityRunCriterionResult,
  QualityRunFinding,
  QualityRunIteration,
} from '@sysdesign/db';

import type { RunRecord } from '../../../core/contracts';
import type { CloseOutcome, RunListQuery, RunRepository } from '../../../core/ports';
import { INTERRUPTED, interruptedError, NEWEST_FIRST, presentFilters } from './conventions';
import { fromRows } from './from-rows';
import type { RunRows } from './rows';
import { toRows } from './to-rows';
import { toSummary } from './to-summary';

/**
 * Runs in Postgres through MikroORM. Every method forks the root
 * EntityManager: the loop runs in the background (and the CLI outside any
 * request), so there is no request context to lean on — the eval worker's
 * discipline. `nativeUpdate` writes without loading; `close` is one
 * transaction, so a run is either fully recorded or still `running` for the
 * boot sweep. The `status: 'running'` guards keep a late finish from
 * overwriting a row the sweep already failed.
 */
@Injectable()
export class MikroOrmRunRepository implements RunRepository {
  constructor(private readonly em: EntityManager) {}

  async open(record: RunRecord, pipelineVersion: string): Promise<void> {
    const em = this.em.fork();
    em.create(QualityRun, { ...toRows(record).run, pipelineVersion, heartbeatAt: new Date() });
    await em.flush();
  }

  async recordExchange(runId: string, exchanges: LlmExchangeSummaryDto[]): Promise<void> {
    const now = new Date();
    await this.em
      .fork()
      .nativeUpdate(
        QualityRun,
        { id: runId, status: 'running' },
        { exchanges, exchangeCount: exchanges.length, heartbeatAt: now, updatedAt: now },
      );
  }

  async heartbeat(runId: string): Promise<void> {
    await this.em
      .fork()
      .nativeUpdate(QualityRun, { id: runId, status: 'running' }, { heartbeatAt: new Date() });
  }

  async close(record: RunRecord): Promise<CloseOutcome> {
    const rows = toRows(record);
    return this.em.fork().transactional(async (tem) => {
      const { id, ...header } = rows.run;
      const row = await tem.findOne(QualityRun, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (row === null) return 'refused';
      const reclaimable = row.status === 'failed' && row.error?.name === INTERRUPTED;
      if (row.status !== 'running' && !reclaimable) return 'refused';
      tem.assign(row, { ...header, updatedAt: new Date() });
      for (const criterion of rows.criteria) {
        tem.create(QualityRunCriterion, { ...withoutRunId(criterion), run: row });
      }
      for (const iteration of rows.iterations) insertIteration(tem, row, iteration);
      return reclaimable ? 'reclaimed' : 'closed';
    });
  }

  async find(runId: string): Promise<QualityRunDto | null> {
    const em = this.em.fork();
    const run = await em.findOne(QualityRun, { id: runId });
    if (!run) return null;
    const [criteria, iterations, findings, results] = await Promise.all([
      em.find(QualityRunCriterion, { run: runId }, { orderBy: { position: 'asc' } }),
      em.find(QualityRunIteration, { run: runId }, { orderBy: { iteration: 'asc' } }),
      em.find(QualityRunFinding, { run: runId }, { orderBy: { position: 'asc' } }),
      em.find(QualityRunCriterionResult, { run: runId }, { orderBy: { position: 'asc' } }),
    ]);
    return fromRows(
      run,
      criteria.map((row) => ({ ...row, runId })),
      iterations.map((row) => ({ ...row, runId })),
      findings.map((row) => ({ ...row, runId, iterationId: row.iteration.id })),
      results.map((row) => ({ ...row, runId, iterationId: row.iteration.id })),
    );
  }

  async list(query: RunListQuery): Promise<[QualityRunSummaryDto[], number]> {
    const em = this.em.fork();
    const [runs, total] = await em.findAndCount(
      QualityRun,
      presentFilters({ pipeline: query.pipeline, status: query.status }),
      { limit: query.limit, offset: query.offset, orderBy: NEWEST_FIRST },
    );
    const counts = await countsFor(
      em,
      runs.map((run) => run.id),
    );
    return [runs.map((run) => toSummary(run, counts(run.id))), total];
  }

  async failStale(before: Date): Promise<number> {
    const now = new Date();
    return this.em
      .fork()
      .nativeUpdate(
        QualityRun,
        { status: 'running', heartbeatAt: { $lt: before } },
        { status: 'failed', finishedAt: now, error: interruptedError('run'), updatedAt: now },
      );
  }
}

/** One iteration and its ledger rows, pointing at the run and at each other by reference. */
function insertIteration(
  em: EntityManager,
  run: QualityRun,
  { row, findings, results }: RunRows['iterations'][number],
): void {
  const iteration = em.create(QualityRunIteration, { ...withoutRunId(row), run });
  for (const finding of findings) {
    em.create(QualityRunFinding, { ...withoutIds(finding), run, iteration });
  }
  for (const result of results) {
    em.create(QualityRunCriterionResult, { ...withoutIds(result), run, iteration });
  }
}

/** The iteration and criterion counts of a page of runs — one query per table, never one per run. */
async function countsFor(
  em: EntityManager,
  ids: string[],
): Promise<(runId: string) => { iterations: number; criteria: number }> {
  const [iterations, criteria] =
    ids.length === 0
      ? [new Map<string, number>(), new Map<string, number>()]
      : await Promise.all([
          countByRun(em, 'quality_run_iteration', ids),
          countByRun(em, 'quality_run_criterion', ids),
        ]);
  return (runId) => ({
    iterations: iterations.get(runId) ?? 0,
    criteria: criteria.get(runId) ?? 0,
  });
}

/** Grouped counts for a page of ids. */
async function countByRun(
  em: EntityManager,
  table: string,
  ids: string[],
): Promise<Map<string, number>> {
  const rows = await em
    .getConnection()
    .execute<{ run_id: string; n: number }[]>(
      `select run_id, count(*)::int as n from "${table}" where run_id in (${ids.map(() => '?').join(', ')}) group by run_id`,
      ids,
    );
  return new Map(rows.map((row) => [row.run_id, row.n]));
}

/** Row fields minus the flattened relation ids; the entity gets references instead. */
function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}
const withoutRunId = <T extends { runId: string }>(row: T) => omit(row, ['runId']);
const withoutIds = <T extends { runId: string; iterationId: string }>(row: T) =>
  omit(row, ['runId', 'iterationId']);
