import type {
  Award,
  AwardsRequest,
  AwardSource,
  SourceAvailability,
  SpendingRequest,
} from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';
import type { UpsertSummary } from './repositories';

/** An award as an adapter normalizes it; the service stamps `fetchedAt`. */
export type AwardDraft = Omit<Award, 'fetchedAt'>;

/** One page of awards from either source. */
export interface AwardPage {
  awards: AwardDraft[];
  /** Records the source returned that did not normalize — counted, never stored. */
  rejected: number;
  /** How many matched in all, when the source says. */
  totalRecords: number | null;
  hasMore: boolean;
}

/** SAM.gov's Contract Awards API — budgeted. */
export interface ContractAwards {
  readonly id: string;
  readonly availability: SourceAvailability;
  search(request: AwardsRequest): Promise<Attempted<Fetched<AwardPage>>>;
}

/** USAspending's award search — free, still ledgered. */
export interface SpendingAwards {
  readonly id: string;
  readonly availability: SourceAvailability;
  search(request: SpendingRequest): Promise<Attempted<Fetched<AwardPage>>>;
}

/** The store-side filters of `GET /awards`; every field optional means unfiltered. */
export interface AwardFilter {
  naicsPrefix: string | null;
  pscPrefix: string | null;
  agencyContains: string | null;
  solicitationNumber: string | null;
  awardeeUei: string | null;
  /** ISO dates on `signedAt`, inclusive. */
  signedFrom: string | null;
  signedTo: string | null;
  source: AwardSource | null;
}

/** One stored award's part in the history index. */
export interface HistoryRow {
  naicsCode: string | null;
  agencyCode: string | null;
  /** ISO date. */
  signedAt: string;
}

export interface AwardRepository {
  /** Insert or refresh by `(source, externalId)`. */
  upsertMany(awards: readonly Award[]): Promise<UpsertSummary>;
  /** Newest signed first, then by id; with the total over the filter. */
  list(filter: AwardFilter, limit: number, offset: number): Promise<[Award[], number]>;
  /** The newest `limit` awards over the filter — what a summary reads. */
  findMatching(filter: AwardFilter, limit: number): Promise<Award[]>;
  /** Every award signed at or after `since`, reduced to what the history factor reads. */
  history(since: string): Promise<HistoryRow[]>;
}
