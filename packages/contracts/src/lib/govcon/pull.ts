import type { ApiResponse } from '../envelope';
import type { OpportunityQuery } from './query';
import type { SourceAvailability } from './source';
import type { SliceOutcome } from './vocab';

/** Inclusive ISO dates the source is asked for. */
export interface PullWindow {
  from: string;
  to: string;
}

export interface SliceReport {
  query: OpportunityQuery;
  outcome: SliceOutcome;
  pages: number;
  /** Records the source returned across the pages fetched. */
  received: number;
  inserted: number;
  updated: number;
  rejected: number;
  /** More records matched than the pages fetched carried. */
  truncated: boolean;
  detail: string | null;
}

export interface PullReport {
  profile: string;
  window: PullWindow;
  source: { id: string; availability: SourceAvailability };
  slices: SliceReport[];
  /** Attempts inside the budget window after this pull, as the ledger counts them; null when it could not be read. */
  spent: number | null;
  budget: number;
  stoppedBy: 'budget' | 'rate-limited' | null;
}

/** The body of `POST /pulls`: a profile and either the last `days` days or an explicit window. */
export interface StartPullRequest {
  profile?: string;
  days?: number;
  from?: string;
  to?: string;
}

export const DEFAULT_PULL_DAYS = 3;

export type StartPullResponse = ApiResponse<PullReport>;
