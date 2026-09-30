import { Injectable } from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import type { SearchProfile } from '@sysdesign/contracts';
import { GovconSearchProfile } from '@sysdesign/db';

import type { ProfileRecord, ProfileRepository } from '../../../core/ports';

const toRecord = (row: GovconSearchProfile): ProfileRecord => ({
  profile: row.document,
  isDefault: row.isDefault,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Profiles in Postgres: one document per slug; the partial unique index keeps one default. */
@Injectable()
export class MikroOrmProfileRepository implements ProfileRepository {
  constructor(private readonly em: EntityManager) {}

  async list(): Promise<ProfileRecord[]> {
    const rows = await this.em.fork().find(GovconSearchProfile, {}, { orderBy: { id: 'asc' } });
    return rows.map(toRecord);
  }

  async find(id: string): Promise<ProfileRecord | null> {
    const row = await this.em.fork().findOne(GovconSearchProfile, { id });
    return row ? toRecord(row) : null;
  }

  async findDefault(): Promise<ProfileRecord | null> {
    const row = await this.em.fork().findOne(GovconSearchProfile, { isDefault: true });
    return row ? toRecord(row) : null;
  }

  count(): Promise<number> {
    return this.em.fork().count(GovconSearchProfile, {});
  }

  async insert(
    profile: SearchProfile,
    isDefault: boolean,
    at: Date,
  ): Promise<ProfileRecord | null> {
    const em = this.em.fork();
    const row = em.create(GovconSearchProfile, {
      id: profile.id,
      company: profile.company,
      document: profile,
      isDefault,
      createdAt: at,
      updatedAt: at,
    });
    try {
      await em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) return null;
      throw error;
    }
    return toRecord(row);
  }

  async update(profile: SearchProfile, at: Date): Promise<ProfileRecord | null> {
    const em = this.em.fork();
    const row = await em.findOne(GovconSearchProfile, { id: profile.id });
    if (!row) return null;
    row.company = profile.company;
    row.document = profile;
    row.updatedAt = at;
    await em.flush();
    return toRecord(row);
  }

  async remove(id: string): Promise<boolean> {
    return (await this.em.fork().nativeDelete(GovconSearchProfile, { id })) > 0;
  }

  /** Clears the flag everywhere, then sets it — one transaction, so the partial unique index never trips. */
  setDefault(id: string): Promise<boolean> {
    return this.em.fork().transactional(async (em) => {
      if ((await em.count(GovconSearchProfile, { id })) === 0) return false;
      await em.nativeUpdate(GovconSearchProfile, { isDefault: true }, { isDefault: false });
      await em.nativeUpdate(GovconSearchProfile, { id }, { isDefault: true });
      return true;
    });
  }
}
