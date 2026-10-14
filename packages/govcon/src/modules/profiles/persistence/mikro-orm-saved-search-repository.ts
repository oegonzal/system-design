import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { GovconSavedSearch, GovconSearchProfile } from '@sysdesign/db';

import type {
  SavedSearchInput,
  SavedSearchRecord,
  SavedSearchRepository,
  SearchRun,
} from '../../../core/ports';
import { readYield } from '../../../core/yield';

const toRecord = (row: GovconSavedSearch): SavedSearchRecord => ({
  id: row.id,
  profileId: row.profile.id,
  name: row.name,
  filter: row.filter,
  days: row.days,
  includedInPull: row.includedInPull,
  pullOrder: row.pullOrder,
  lastRunAt: row.lastRunAt,
  // A stored yield the schema refuses reads as none.
  lastYield: readYield(row.lastYield),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Saved searches in Postgres; the unique (profile, name) answers the two conflicts. */
@Injectable()
export class MikroOrmSavedSearchRepository implements SavedSearchRepository {
  constructor(private readonly em: EntityManager) {}

  async listByProfile(profileId: string): Promise<SavedSearchRecord[]> {
    const rows = await this.em
      .fork()
      .find(
        GovconSavedSearch,
        { profile: profileId },
        { orderBy: { pullOrder: 'asc', name: 'asc' } },
      );
    return rows.map(toRecord);
  }

  async find(id: string): Promise<SavedSearchRecord | null> {
    const row = await this.em.fork().findOne(GovconSavedSearch, { id });
    return row ? toRecord(row) : null;
  }

  async insert(
    profileId: string,
    input: SavedSearchInput,
    at: Date,
  ): Promise<SavedSearchRecord | null> {
    const em = this.em.fork();
    const row = em.create(GovconSavedSearch, {
      id: randomUUID(),
      profile: em.getReference(GovconSearchProfile, profileId),
      ...input,
      lastRunAt: null,
      lastYield: null,
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

  async update(
    id: string,
    input: SavedSearchInput,
    at: Date,
  ): Promise<SavedSearchRecord | null | 'conflict'> {
    const em = this.em.fork();
    const row = await em.findOne(GovconSavedSearch, { id });
    if (!row) return null;
    Object.assign(row, input, { updatedAt: at });
    try {
      await em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) return 'conflict';
      throw error;
    }
    return toRecord(row);
  }

  async remove(id: string): Promise<boolean> {
    return (await this.em.fork().nativeDelete(GovconSavedSearch, { id })) > 0;
  }

  async recordRuns(runs: readonly SearchRun[]): Promise<void> {
    const em = this.em.fork();
    for (const run of runs) {
      await em.nativeUpdate(
        GovconSavedSearch,
        { id: run.id },
        run.yield === null ? { lastRunAt: run.at } : { lastRunAt: run.at, lastYield: run.yield },
      );
    }
  }
}
