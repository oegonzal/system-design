import { Injectable } from '@nestjs/common';
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
import type { RunListQuery, RunRepository } from '../../../core/ports';
import { fromRows, toRows, toSummary } from './run-mapper';

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
    em.create(QualityRun, { ...toRows(record).run, pipelineVersion });
    await em.flush();
  }

  async recordExchange(runId: string, exchanges: LlmExchangeSummaryDto[]): Promise<void> {
    await this.em
      .fork()
      .nativeUpdate(
        QualityRun,
        { id: runId, status: 'running' },
        { exchanges, exchangeCount: exchanges.length, updatedAt: new Date() },
      );
  }

  async close(record: RunRecord): Promise<void> {
    const rows = toRows(record);
    await this.em.fork().transactional(async (tem) => {
      const { id, ...header } = rows.run;
      await tem.nativeUpdate(
        QualityRun,
        { id, status: 'running' },
        { ...header, updatedAt: new Date() },
      );
      const run = tem.getReference(QualityRun, id);
      for (const criterion of rows.criteria) {
        tem.create(QualityRunCriterion, { ...withoutRunId(criterion), run });
      }
      for (const { row, findings, results } of rows.iterations) {
        const iteration = tem.create(QualityRunIteration, { ...withoutRunId(row), run });
        for (const finding of findings) {
          tem.create(QualityRunFinding, { ...withoutIds(finding), run, iteration });
        }
        for (const result of results) {
          tem.create(QualityRunCriterionResult, { ...withoutIds(result), run, iteration });
        }
      }
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
      {
        ...(query.pipeline ? { pipeline: query.pipeline } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      { limit: query.limit, offset: query.offset, orderBy: { startedAt: 'desc', id: 'desc' } },
    );
    const ids = runs.map((run) => run.id);
    const [iterations, criteria] =
      ids.length === 0
        ? [new Map<string, number>(), new Map<string, number>()]
        : await Promise.all([
            countByRun(em, 'quality_run_iteration', ids),
            countByRun(em, 'quality_run_criterion', ids),
          ]);
    return [
      runs.map((run) =>
        toSummary(run, {
          iterations: iterations.get(run.id) ?? 0,
          criteria: criteria.get(run.id) ?? 0,
        }),
      ),
      total,
    ];
  }

  async failInterrupted(): Promise<number> {
    return this.em.fork().nativeUpdate(
      QualityRun,
      { status: 'running' },
      {
        status: 'failed',
        finishedAt: new Date(),
        error: {
          name: 'Interrupted',
          message: 'the service restarted while the run was in flight',
          stack: null,
        },
        updatedAt: new Date(),
      },
    );
  }
}

/** Grouped counts for a page of ids — one query per table, never one per run. */
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
