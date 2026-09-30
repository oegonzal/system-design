import type { QueryFilter } from '@sysdesign/contracts';

export interface SavedSearchInput {
  name: string;
  filter: QueryFilter;
  days: number;
  includedInPull: boolean;
  pullOrder: number;
}

export interface SavedSearchRecord extends SavedSearchInput {
  id: string;
  profileId: string;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Saved searches by profile; names are unique within a profile. */
export interface SavedSearchRepository {
  /** Ordered by `pullOrder`, then name. */
  listByProfile(profileId: string): Promise<SavedSearchRecord[]>;
  find(id: string): Promise<SavedSearchRecord | null>;
  /** `null` when the name is taken within the profile. */
  insert(profileId: string, input: SavedSearchInput, at: Date): Promise<SavedSearchRecord | null>;
  /** `null` when there is no such search; `'conflict'` when the new name is taken. */
  update(
    id: string,
    input: SavedSearchInput,
    at: Date,
  ): Promise<SavedSearchRecord | null | 'conflict'>;
  remove(id: string): Promise<boolean>;
  markRun(ids: readonly string[], at: Date): Promise<void>;
}
