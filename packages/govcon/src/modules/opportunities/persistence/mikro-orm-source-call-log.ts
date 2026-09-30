import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { SourceOperation } from '@sysdesign/contracts';
import { GovconSourceCall } from '@sysdesign/db';

import type { FreshCall, LedgerEntry, SourceCallLog, SourceCallRecord } from '../../../core/ports';

/**
 * The call ledger in Postgres: append-only rows, one per HTTP attempt, read
 * three ways — the latest successful row of an operation for a query key
 * inside the cache window, the count of every attempt against a source
 * inside the budget window, and the page newest first.
 */
@Injectable()
export class MikroOrmSourceCallLog implements SourceCallLog {
  constructor(private readonly em: EntityManager) {}

  async record<K extends SourceOperation>(entry: LedgerEntry<K>): Promise<void> {
    const em = this.em.fork();
    em.create(GovconSourceCall, { id: randomUUID(), ...entry });
    await em.flush();
  }

  async findFresh(
    source: string,
    operation: SourceOperation,
    queryKey: string,
    notBefore: Date,
  ): Promise<FreshCall | null> {
    const row = await this.em
      .fork()
      .findOne(
        GovconSourceCall,
        { source, operation, queryKey, outcome: 'ok', requestedAt: { $gte: notBefore } },
        { orderBy: { requestedAt: 'desc', seq: 'desc' } },
      );
    return row ? { requestedAt: row.requestedAt, recordCount: row.recordCount } : null;
  }

  countSince(source: string, since: Date): Promise<number> {
    return this.em.fork().count(GovconSourceCall, { source, requestedAt: { $gte: since } });
  }

  async list(limit: number, offset: number): Promise<[SourceCallRecord[], number]> {
    const [rows, total] = await this.em
      .fork()
      .findAndCount(
        GovconSourceCall,
        {},
        { orderBy: { requestedAt: 'desc', seq: 'desc' }, limit, offset },
      );
    return [rows.map(toRecord), total];
  }
}

/** A stored row read back. `operation` and `query` were written as one typed pair, so they are read as one. */
const toRecord = (row: GovconSourceCall): SourceCallRecord =>
  ({
    id: row.id,
    source: row.source,
    operation: row.operation,
    query: row.query,
    attempt: row.attempt,
    queryKey: row.queryKey,
    requestedAt: row.requestedAt,
    durationMs: row.durationMs,
    status: row.status,
    outcome: row.outcome,
    totalRecords: row.totalRecords,
    recordCount: row.recordCount,
    error: row.error,
  }) as SourceCallRecord;
