/** Profiles and their saved searches in memory. */
import { type SearchProfile } from '@sysdesign/contracts';

import type {
  ProfileRecord,
  ProfileRepository,
  SavedSearchInput,
  SavedSearchRecord,
  SavedSearchRepository,
  SearchRun,
} from '../ports';

export class InMemoryProfileRepository implements ProfileRepository {
  readonly rows = new Map<string, ProfileRecord>();

  async list(): Promise<ProfileRecord[]> {
    return [...this.rows.values()].sort((a, b) => a.profile.id.localeCompare(b.profile.id));
  }

  async find(id: string): Promise<ProfileRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findDefault(): Promise<ProfileRecord | null> {
    return [...this.rows.values()].find((row) => row.isDefault) ?? null;
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  async insert(
    profile: SearchProfile,
    isDefault: boolean,
    at: Date,
  ): Promise<ProfileRecord | null> {
    if (this.rows.has(profile.id)) return null;
    const row = { profile, isDefault, createdAt: at, updatedAt: at };
    this.rows.set(profile.id, row);
    return row;
  }

  async update(profile: SearchProfile, at: Date): Promise<ProfileRecord | null> {
    const existing = this.rows.get(profile.id);
    if (!existing) return null;
    const row = { ...existing, profile, updatedAt: at };
    this.rows.set(profile.id, row);
    return row;
  }

  async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async setDefault(id: string): Promise<boolean> {
    if (!this.rows.has(id)) return false;
    for (const [key, row] of this.rows) this.rows.set(key, { ...row, isDefault: key === id });
    return true;
  }
}

export class InMemorySavedSearchRepository implements SavedSearchRepository {
  readonly rows = new Map<string, SavedSearchRecord>();
  private next = 1;

  async listByProfile(profileId: string): Promise<SavedSearchRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.profileId === profileId)
      .sort((a, b) => a.pullOrder - b.pullOrder || a.name.localeCompare(b.name));
  }

  async find(id: string): Promise<SavedSearchRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async insert(
    profileId: string,
    input: SavedSearchInput,
    at: Date,
  ): Promise<SavedSearchRecord | null> {
    if (this.taken(profileId, input.name, null)) return null;
    const row = {
      id: `s-${this.next++}`,
      profileId,
      lastRunAt: null,
      lastYield: null,
      createdAt: at,
      updatedAt: at,
      ...input,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(
    id: string,
    input: SavedSearchInput,
    at: Date,
  ): Promise<SavedSearchRecord | null | 'conflict'> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (this.taken(existing.profileId, input.name, id)) return 'conflict';
    const row = { ...existing, ...input, updatedAt: at };
    this.rows.set(id, row);
    return row;
  }

  async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async recordRuns(runs: readonly SearchRun[]): Promise<void> {
    for (const run of runs) {
      const row = this.rows.get(run.id);
      if (row === undefined) continue;
      this.rows.set(run.id, {
        ...row,
        lastRunAt: run.at,
        lastYield: run.yield ?? row.lastYield,
      });
    }
  }

  private taken(profileId: string, name: string, except: string | null): boolean {
    return [...this.rows.values()].some(
      (row) => row.profileId === profileId && row.name === name && row.id !== except,
    );
  }
}
