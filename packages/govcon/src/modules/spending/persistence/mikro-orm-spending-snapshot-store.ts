import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { SpendingLens } from '@sysdesign/contracts';
import { GovconSpendingSnapshot } from '@sysdesign/db';

import type { SnapshotRow, SpendingSnapshotStore } from '../../../core/ports';

const toRow = (row: GovconSpendingSnapshot): SnapshotRow => ({
  lens: row.lens,
  queryKey: row.queryKey,
  query: row.query,
  fetchedAt: row.fetchedAt,
  asOf: row.asOf === null ? null : String(row.asOf).slice(0, 10),
  requests: row.requests,
  payload: row.payload,
});

/** Lens snapshots in Postgres, one per lens and canonical query, replaced on refresh. */
@Injectable()
export class MikroOrmSpendingSnapshotStore implements SpendingSnapshotStore {
  constructor(private readonly em: EntityManager) {}

  async find(lens: SpendingLens, queryKey: string): Promise<SnapshotRow | null> {
    const row = await this.em.fork().findOne(GovconSpendingSnapshot, { lens, queryKey });
    return row === null ? null : toRow(row);
  }

  async put(row: SnapshotRow): Promise<void> {
    await this.em.fork().upsert(
      GovconSpendingSnapshot,
      {
        lens: row.lens,
        queryKey: row.queryKey,
        query: row.query,
        fetchedAt: row.fetchedAt,
        asOf: row.asOf,
        requests: row.requests,
        payload: row.payload,
      },
      { onConflictFields: ['lens', 'queryKey'] },
    );
  }
}
