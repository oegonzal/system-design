import type { ApiResponse } from '../envelope';
import type { PullReport, PullWindow } from './pull';
import type { QueryFilter } from './query';
import type { LeadTier } from './vocab';

/**
 * What a saved search brought in the last time it read the source: the
 * evidence a search is kept in the daily pull on, or dropped from it. The
 * tiers are the profile's ranking of what the run carried, taken when it
 * ran, as the leads list would have shown it.
 */
export interface SearchYield {
  /** ISO 8601, when the run that read the source started. */
  at: string;
  /** The posted dates it asked for. */
  window: PullWindow;
  /** Records the source returned across the pages fetched. */
  received: number;
  /** Of them, notices the store had not seen before. */
  inserted: number;
  /** More records matched than the pages fetched carried. */
  truncated: boolean;
  /** The notices it carried that the profile's leads list ranks, by tier. */
  tiers: Record<LeadTier, number>;
  /** The notices it carried that a gate of the profile's keeps off the list. */
  unlisted: number;
}

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
  /** What its last read of the source brought in; null until a run has read it. A run answered from the cache window leaves it as it was. */
  lastYield: SearchYield | null;
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
