import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { GovconSavedView, GovconSearchProfile } from '@sysdesign/db';

import type { SavedViewInput, SavedViewRecord, SavedViewRepository } from '../../../core/ports';

const toRecord = (row: GovconSavedView): SavedViewRecord => ({
  id: row.id,
  profileId: row.profile.id,
  name: row.name,
  href: row.href,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Saved views in Postgres; the unique (profile, name) is what a save lands on. */
@Injectable()
export class MikroOrmSavedViewRepository implements SavedViewRepository {
  constructor(private readonly em: EntityManager) {}

  async listByProfile(profileId: string): Promise<SavedViewRecord[]> {
    const rows = await this.em
      .fork()
      .find(GovconSavedView, { profile: profileId }, { orderBy: { name: 'asc' } });
    return rows.map(toRecord);
  }

  /** One statement: the row is inserted, or the row already holding the name takes the address — two saves at once cannot leave two rows or lose one. */
  async save(profileId: string, input: SavedViewInput, at: Date): Promise<SavedViewRecord> {
    const em = this.em.fork();
    const row = await em.upsert(
      GovconSavedView,
      {
        id: randomUUID(),
        profile: em.getReference(GovconSearchProfile, profileId),
        name: input.name,
        href: input.href,
        createdAt: at,
        updatedAt: at,
      },
      { onConflictFields: ['profile', 'name'], onConflictMergeFields: ['href', 'updatedAt'] },
    );
    return toRecord(row);
  }

  async remove(id: string): Promise<boolean> {
    return (await this.em.fork().nativeDelete(GovconSavedView, { id })) > 0;
  }
}
