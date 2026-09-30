import type { ApiListResponse, ApiResponse } from '../envelope';
import type { OperationQuery } from './query';
import type { SourceCallOutcome, SourceOperation } from './vocab';

export interface SourceAvailability {
  enabled: boolean;
  reason: 'no-key' | null;
}

/** One upstream by id, and the bucket it spends — none for a free source. */
export interface SourceInfo {
  id: string;
  availability: SourceAvailability;
  bucket: string | null;
}

/** One rolling window of attempts, shared by every operation against the source it names. */
export interface BudgetBucket {
  /** The source id the bucket counts, e.g. `sam.gov`. */
  id: string;
  /** Attempts inside the window, as the ledger counts them; null when it could not be read. */
  spent: number | null;
  limit: number;
  windowHours: number;
}

/** `GET /source`: every upstream, every bucket, and the cache window. */
export interface SourceStatus {
  sources: SourceInfo[];
  buckets: BudgetBucket[];
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
  operation?: SourceOperation;
  limit?: number;
  offset?: number;
}

export type GetSourceResponse = ApiResponse<SourceStatus>;
export type ListSourceCallsResponse = ApiListResponse<SourceCall>;
export type FetchDescriptionResponse = ApiResponse<DescriptionFetch>;
