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
  | BudgetExhausted
  | SourceFailure;

/** The rolling-day budget is spent; nothing was called. */
export interface BudgetExhausted {
  kind: 'budget-exhausted';
  spent: number;
  budget: number;
}

/** The upstream answered with something other than a page or a description. */
export interface SourceFailure {
  kind: 'error';
  outcome: Exclude<SourceCallOutcome, 'ok'>;
  status: number | null;
  /** Provider detail, bounded, never the request URL. */
  message: string;
}

/**
 * A notice's description: the adapter normalizes the provider's markup to
 * text at fetch time and hands the body as received along, so the row can
 * keep both and nothing downstream ever renders HTML.
 */
export type DescribeResult =
  { kind: 'ok'; text: string; raw: unknown } | BudgetExhausted | SourceFailure;

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
  /** One request per notice; the store, not the source, remembers the answer. */
  describe(noticeId: string): Promise<DescribeResult>;
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

/** A ledger row as stored: the call plus the id the row was given. */
export interface SourceCallRecord extends SourceCall {
  id: string;
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
  /** Every attempt since `since`, whatever its outcome or operation. */
  countSince(source: string, since: Date): Promise<number>;
  /** Newest first, with the total. */
  list(limit: number, offset: number): Promise<[SourceCallRecord[], number]>;
}

/** A description once fetched; the row keeps it for good. */
export interface StoredDescription {
  text: string;
  raw: unknown;
  fetchedAt: Date;
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
  findDescription(noticeId: string): Promise<StoredDescription | null>;
  /** Only ever written here — a pull's upsert leaves the description columns alone. */
  saveDescription(noticeId: string, description: StoredDescription): Promise<void>;
}
