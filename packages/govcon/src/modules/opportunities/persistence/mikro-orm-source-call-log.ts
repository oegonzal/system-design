import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { GovconSourceCall } from '@sysdesign/db';

import type { FreshCall, SourceCall, SourceCallLog } from '../../../core/ports';

/**
 * The call ledger in Postgres: append-only rows, read two ways — the latest
 * successful search for a query key inside the cache window, and the count of
 * every attempt, whatever its operation, inside the budget window.
 */
@Injectable()
export class MikroOrmSourceCallLog implements SourceCallLog {
  constructor(private readonly em: EntityManager) {}

  async record(call: SourceCall): Promise<void> {
    const em = this.em.fork();
    em.create(GovconSourceCall, { id: randomUUID(), ...call });
    await em.flush();
  }

  async findFresh(source: string, queryKey: string, notBefore: Date): Promise<FreshCall | null> {
    const row = await this.em
      .fork()
      .findOne(
        GovconSourceCall,
        { source, operation: 'search', queryKey, outcome: 'ok', requestedAt: { $gte: notBefore } },
        { orderBy: { requestedAt: 'desc' } },
      );
    return row
      ? {
          requestedAt: row.requestedAt,
          totalRecords: row.totalRecords,
          recordCount: row.recordCount,
        }
      : null;
  }

  countSince(source: string, since: Date): Promise<number> {
    return this.em.fork().count(GovconSourceCall, { source, requestedAt: { $gte: since } });
  }
}
