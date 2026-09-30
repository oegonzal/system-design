import type { ApiResponse } from '../envelope';
import type { PullReport } from './pull';
import type { QueryFilter } from './query';

/**
 * A saved search: one `QueryFilter` a profile keeps by name, run on demand
 * against the last `days` days, and — when flagged — as one slice of the
 * daily pull, in `pullOrder`. The profile's pull slices are exactly its
 * saved searches with `includedInPull`.
 */
export interface SavedSearch {
  id: string;
  profileId: string;
  name: string;
  filter: QueryFilter;
  days: number;
  includedInPull: boolean;
  pullOrder: number;
  /** ISO 8601, when it last ran by itself or inside a pull. */
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `POST /profiles/:id/searches` and `PUT /searches/:id`. */
export interface SaveSavedSearchRequest {
  name: string;
  filter: QueryFilter;
  days: number;
  includedInPull: boolean;
  pullOrder?: number;
}

/** `POST /searches/run`: a filter run once, now, without saving it. */
export interface RunSearchRequest {
  profile?: string;
  filter: QueryFilter;
  days?: number;
  from?: string;
  to?: string;
}

export type ListSavedSearchesResponse = ApiResponse<SavedSearch[]>;
export type SaveSavedSearchResponse = ApiResponse<SavedSearch>;
/** A run is a pull of one slice. */
export type RunSearchResponse = ApiResponse<PullReport>;
