/**
 * Spaces in Postgres: the strategy and the policy a space was created under,
 * kept as the snapshots it compiles from on every load. Each operation runs on
 * a fork of its own. The entity is aliased `MemorySpaceRow`, as the record
 * store aliases its own.
 */
import type { EntityManager } from '@mikro-orm/postgresql';
import { MemorySpace as MemorySpaceRow } from '@sysdesign/db';

import type { SpaceStore, StoredSpace } from '../../ports';

export class MikroOrmSpaceStore implements SpaceStore {
  constructor(private readonly em: EntityManager) {}

  async insert(space: StoredSpace): Promise<void> {
    await this.em.fork().insert(MemorySpaceRow, { ...space });
  }

  async get(id: string): Promise<StoredSpace | null> {
    const row = await this.em.fork().findOne(MemorySpaceRow, { id });
    return row === null ? null : spaceOf(row);
  }
}

const spaceOf = (row: MemorySpaceRow): StoredSpace => ({
  id: row.id,
  designRunId: row.designRunId,
  strategy: row.strategy,
  policy: row.policy,
  policySource: row.policySource,
  createdAt: row.createdAt,
});
