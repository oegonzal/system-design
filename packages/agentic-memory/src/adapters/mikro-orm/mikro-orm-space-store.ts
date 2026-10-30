/**
 * Spaces in Postgres: the strategy and the policy a space was created under,
 * kept as the snapshots it compiles from on every load, under the name it was
 * ensured by when it has one. Holds the contract the in-memory fake states
 * (`space-store-contract.ts` runs against both). Each operation runs on a fork
 * of its own. The entity is aliased `MemorySpaceRow`, as the record store
 * aliases its own.
 */
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { MemorySpace as MemorySpaceRow } from '@sysdesign/db';

import type { SpaceStore, StoredSpace } from '../../ports';

export class MikroOrmSpaceStore implements SpaceStore {
  constructor(private readonly em: EntityManager) {}

  /**
   * The partial unique index on the name refuses a second holder. An unnamed
   * space is under no such index, so a violation there is the primary key's —
   * no declared outcome, since the id is the runtime's own fresh uuid.
   */
  async insert(space: StoredSpace): Promise<'inserted' | 'name_taken'> {
    try {
      await this.em.fork().insert(MemorySpaceRow, { ...space });
      return 'inserted';
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException && space.name !== null) {
        return 'name_taken';
      }
      throw error;
    }
  }

  async get(id: string): Promise<StoredSpace | null> {
    const row = await this.em.fork().findOne(MemorySpaceRow, { id });
    return row === null ? null : spaceOf(row);
  }

  async findByName(name: string): Promise<StoredSpace | null> {
    const row = await this.em.fork().findOne(MemorySpaceRow, { name });
    return row === null ? null : spaceOf(row);
  }
}

const spaceOf = (row: MemorySpaceRow): StoredSpace => ({
  id: row.id,
  name: row.name,
  designRunId: row.designRunId,
  strategy: row.strategy,
  policy: row.policy,
  policySource: row.policySource,
  createdAt: row.createdAt,
});
