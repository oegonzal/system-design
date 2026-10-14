import type { Opportunity } from '@sysdesign/contracts';

/** A description once fetched; the row keeps it for good. */
export interface StoredDescription {
  text: string;
  fetchedAt: Date;
}

/**
 * What the store filters before a ranking loads anything: the profile's
 * gates and the request's filters, in SQL. Null means "no condition".
 */
export interface CandidateFilter {
  /** Drop records the source marked inactive; unknown stays in. */
  activeOnly: boolean;
  /** Keep only records posted at or after this. */
  postedOnOrAfter: Date | null;
  /** Drop records whose stated deadline is before this; no deadline stays in. */
  deadlineOnOrAfter: Date | null;
  /** Keep only records with a stated deadline at or before this. */
  deadlineOnOrBefore: Date | null;
  /** Codes the profile may bid on; a record with no set-aside is always kept. */
  setAsideCodes: readonly string[] | null;
  excludeNoticeTypes: readonly string[];
  /** A NAICS code or family the record's primary code starts with. */
  naicsPrefix: string | null;
  /** Exactly these primary NAICS codes; an empty set matches nothing. */
  naicsCodes: readonly string[] | null;
  setAsideCode: string | null;
  /** Any of these notice types, by the source's label; an empty set matches nothing. */
  noticeTypes: readonly string[] | null;
  /** Case-insensitive substring of the agency path. */
  agencyContains: string | null;
  /** Case-insensitive substring of the title or the solicitation number. */
  textContains: string | null;
  limit: number;
}

/** The candidates newest first, and whether the limit cut the set short. */
export interface CandidateSet {
  opportunities: Opportunity[];
  capped: boolean;
}

export interface UpsertSummary {
  inserted: number;
  updated: number;
}

export interface OpportunityRepository {
  /** Insert or refresh by notice id; `seenAt` becomes `lastSeenAt`, and `firstSeenAt` for new rows. */
  upsertMany(items: readonly Opportunity[], seenAt: Date): Promise<UpsertSummary>;
  /** Ordered `postedAt desc, noticeId asc`; only the normalized columns are read. */
  findCandidates(filter: CandidateFilter): Promise<CandidateSet>;
  findOne(noticeId: string): Promise<Opportunity | null>;
  findDescription(noticeId: string): Promise<StoredDescription | null>;
  /** Only ever written here — a pull's upsert leaves the description columns alone. */
  saveDescription(noticeId: string, description: StoredDescription): Promise<void>;
}
