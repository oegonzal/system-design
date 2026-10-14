import type { QueryFilter, SearchYield } from '@sysdesign/contracts';

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
  /** What its last read of the source brought in; null until a run has read it. */
  lastYield: SearchYield | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One run of a saved search, by itself or as a slice of a pull. */
export interface SearchRun {
  id: string;
  at: Date;
  /** What the run brought in when it read the source; null — answered from the cache window, skipped, refused — leaves the last yield as it is. */
  yield: SearchYield | null;
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
  /** Each search stamped as run then; its yield replaced only when the run brought one. */
  recordRuns(runs: readonly SearchRun[]): Promise<void>;
}
