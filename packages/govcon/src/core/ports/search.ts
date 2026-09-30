import type { Opportunity, OpportunityQuery, SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';

export interface RejectedRecord {
  noticeId: string | null;
  issues: string[];
}

/** One page of a search: what normalized, what did not, and how many matched in all. */
export interface SearchPage {
  opportunities: Opportunity[];
  /** Records the source returned that did not normalize — counted, never stored. */
  rejected: RejectedRecord[];
  totalRecords: number;
}

export interface OpportunitySearch {
  /** Names the source in the ledger and the stored records, e.g. `sam.gov`. */
  readonly id: string;
  readonly availability: SourceAvailability;
  search(query: OpportunityQuery): Promise<Attempted<Fetched<SearchPage>>>;
}
