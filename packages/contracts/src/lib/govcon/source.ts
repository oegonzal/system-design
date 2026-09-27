import type { ApiListResponse, ApiResponse } from '../envelope';
import type { OpportunityQuery } from './query';
import type { SourceCallOutcome, SourceOperation } from './vocab';

export interface SourceAvailability {
  enabled: boolean;
  reason: 'no-key' | null;
}

export interface SourceBudgetDto {
  /** Attempts inside the window, as the ledger counts them; null when it could not be read. */
  spent: number | null;
  limit: number;
  windowHours: number;
}

/** `GET /source`: what the upstream is and how much of today's budget is left. */
export interface SourceStatusDto {
  id: string;
  availability: SourceAvailability;
  budget: SourceBudgetDto;
  cacheTtlHours: number;
}

/** A notice's description as text — the row keeps it once fetched. */
export interface DescriptionDto {
  text: string;
  /** ISO 8601. */
  fetchedAt: string;
}

/** The outcome of asking for a description: a domain result, not an exception. */
export type DescriptionResultDto =
  | { status: 'ok'; description: DescriptionDto }
  | { status: 'budget-exhausted'; spent: number; budget: number }
  | { status: 'error'; message: string };

/** What a description call asked for — the ledger's `query` for that operation. */
export interface DescriptionRequest {
  noticeId: string;
}

/** One row of the call ledger, `GET /source/calls`. */
export interface SourceCallDto {
  id: string;
  source: string;
  operation: SourceOperation;
  queryKey: string;
  query: OpportunityQuery | DescriptionRequest;
  /** ISO 8601. */
  requestedAt: string;
  durationMs: number;
  status: number | null;
  outcome: SourceCallOutcome;
  totalRecords: number | null;
  recordCount: number | null;
  error: string | null;
}

export interface ListCallsQuery {
  limit?: number;
  offset?: number;
}

export const DEFAULT_CALL_LIMIT = 50;
export const MAX_CALL_LIMIT = 200;

export type GetSourceResponse = ApiResponse<SourceStatusDto>;
export type ListSourceCallsResponse = ApiListResponse<SourceCallDto>;
export type FetchDescriptionResponse = ApiResponse<DescriptionResultDto>;
