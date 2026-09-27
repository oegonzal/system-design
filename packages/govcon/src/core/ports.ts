/**
 * The ports the govcon package runs over. The real source is SAM.gov behind
 * the budgeted decorator; the repository and the call log are MikroORM; specs
 * hand in the fakes from `./testing`. Nothing here knows about Nest, the
 * filesystem, the environment, `fetch` or a clock.
 */
import type {
  DescriptionRequest,
  Opportunity,
  SourceAvailability,
  SourceCallOutcome,
  SourceOperation,
} from '@sysdesign/contracts';

import type { OpportunityQuery } from './query';

export type { SourceAvailability };

/**
 * What one search came back as. A raw adapter only ever answers `ok` or
 * `error`; the budgeted decorator adds `cached` (the same query was pulled
 * inside the cache window, so its records are already stored — nothing to
 * fetch) and `budget-exhausted` (the rolling-day budget is spent — nothing was
 * called). One union, so a consumer handles every case once.
 */
export type SourceResult =
  | {
      kind: 'ok';
      opportunities: FetchedOpportunity[];
      /** Records the source returned that did not normalize — counted, never stored. */
      rejected: RejectedRecord[];
      totalRecords: number;
    }
  | { kind: 'cached'; requestedAt: string; recordCount: number | null }
  | { kind: 'budget-exhausted'; spent: number; budget: number }
  | {
      kind: 'error';
      outcome: Exclude<SourceCallOutcome, 'ok'>;
      status: number | null;
      /** Provider detail, bounded, never the request URL. */
      message: string;
    };

/** A normalized record together with the record as the source returned it. */
export interface FetchedOpportunity {
  opportunity: Opportunity;
  raw: unknown;
}

export interface RejectedRecord {
  noticeId: string | null;
  issues: string[];
}

export interface OpportunitySource {
  /** Names the source in the call log and the stored records, e.g. `sam.gov`. */
  readonly id: string;
  readonly availability: SourceAvailability;
  search(query: OpportunityQuery): Promise<SourceResult>;
}

/** One upstream request as the ledger keeps it. */
export interface SourceCall {
  source: string;
  /** A search page or a notice description; every operation spends the budget. */
  operation: SourceOperation;
  queryKey: string;
  query: OpportunityQuery | DescriptionRequest;
  requestedAt: Date;
  durationMs: number;
  status: number | null;
  outcome: SourceCallOutcome;
  totalRecords: number | null;
  recordCount: number | null;
  error: string | null;
}

/** A successful call inside the cache window. */
export interface FreshCall {
  requestedAt: Date;
  totalRecords: number | null;
  recordCount: number | null;
}

export interface SourceCallLog {
  record(call: SourceCall): Promise<void>;
  /** The latest `ok` call for the key made at or after `notBefore`, if any. */
  findFresh(source: string, queryKey: string, notBefore: Date): Promise<FreshCall | null>;
  /** Every attempt since `since`, whatever its outcome. */
  countSince(source: string, since: Date): Promise<number>;
}

export interface CandidateFilter {
  /** Drop records the source marked inactive; unknown stays in. */
  activeOnly: boolean;
  /** Drop records whose stated deadline is before this; no deadline stays in. */
  deadlineOnOrAfter: Date | null;
}

export interface UpsertSummary {
  inserted: number;
  updated: number;
}

export interface OpportunityRepository {
  /** Insert or refresh by notice id; `seenAt` becomes `lastSeenAt`, and `firstSeenAt` for new rows. */
  upsertMany(items: readonly FetchedOpportunity[], seenAt: Date): Promise<UpsertSummary>;
  findCandidates(filter: CandidateFilter): Promise<Opportunity[]>;
  findOne(noticeId: string): Promise<Opportunity | null>;
}
