import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { MemorySpaceDigest } from '@sysdesign/db';

import type { AppliedDigest, DigestLedger } from '../ledger';

/**
 * Applied digests in Postgres (the `memory_space_digest` table), holding the
 * contract the in-memory ledger states (`digest-ledger-contract.ts` runs
 * against both). One row per digest, keyed by its orchestration, and each
 * operation on a fork of its own: a second apply loses on the primary key and
 * answers `exists`, the first row left as it was.
 */
export class MikroOrmDigestLedger implements DigestLedger {
  constructor(private readonly em: EntityManager) {}

  async find(orchestrationRunId: string): Promise<AppliedDigest | null> {
    const row = await this.em.fork().findOne(MemorySpaceDigest, { orchestrationRunId });
    return row === null ? null : appliedOf(row);
  }

  async record({ spaceId, ...applied }: AppliedDigest): Promise<'recorded' | 'exists'> {
    try {
      await this.em.fork().insert(MemorySpaceDigest, { ...applied, space: spaceId });
      return 'recorded';
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) return 'exists';
      throw error;
    }
  }
}

const appliedOf = (row: MemorySpaceDigest): AppliedDigest => ({
  orchestrationRunId: row.orchestrationRunId,
  spaceId: row.space,
  digestRunId: row.digestRunId,
  items: row.items,
  appliedAt: row.appliedAt,
});
