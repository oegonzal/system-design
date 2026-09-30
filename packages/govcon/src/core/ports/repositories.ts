import type { Opportunity } from '@sysdesign/contracts';

/** A description once fetched; the row keeps it for good. */
export interface StoredDescription {
  text: string;
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
  upsertMany(items: readonly Opportunity[], seenAt: Date): Promise<UpsertSummary>;
  findCandidates(filter: CandidateFilter): Promise<Opportunity[]>;
  findOne(noticeId: string): Promise<Opportunity | null>;
  findDescription(noticeId: string): Promise<StoredDescription | null>;
  /** Only ever written here — a pull's upsert leaves the description columns alone. */
  saveDescription(noticeId: string, description: StoredDescription): Promise<void>;
}
