import type { ApiListResponse, ApiResponse } from '../envelope';
import type { OperationQuery } from './query';
import type { SourceCallOutcome } from './vocab';

export interface SourceAvailability {
  enabled: boolean;
  reason: 'no-key' | null;
}

/** One rolling window of attempts against one upstream. */
export interface BudgetBucket {
  /** Attempts inside the window, as the ledger counts them; null when it could not be read. */
  spent: number | null;
  limit: number;
  windowHours: number;
}

/** `GET /source`: what the upstream is and how much of today's budget is left. */
export interface SourceStatus {
  id: string;
  availability: SourceAvailability;
  budget: BudgetBucket;
  cacheTtlHours: number;
}

/** A notice's description as text — the row keeps it once fetched. */
export interface Description {
  text: string;
  /** ISO 8601. */
  fetchedAt: string;
}

/** The outcome of asking for a description: a domain result, not an exception. */
export type DescriptionFetch =
  | { status: 'ok'; description: Description }
  | { status: 'budget-exhausted'; spent: number; budget: number }
  | { status: 'error'; message: string };

/** One row of the call ledger, `GET /source/calls`; `operation` types `query`. */
export type SourceCall = OperationQuery & {
  id: string;
  source: string;
  /** 1 for the first HTTP attempt of a call, 2 for its retry — each is a row. */
  attempt: number;
  queryKey: string;
  /** ISO 8601. */
  requestedAt: string;
  durationMs: number;
  status: number | null;
  outcome: SourceCallOutcome;
  totalRecords: number | null;
  recordCount: number | null;
  error: string | null;
};

export interface ListCallsQuery {
  limit?: number;
  offset?: number;
}

export type GetSourceResponse = ApiResponse<SourceStatus>;
export type ListSourceCallsResponse = ApiListResponse<SourceCall>;
export type FetchDescriptionResponse = ApiResponse<DescriptionFetch>;
