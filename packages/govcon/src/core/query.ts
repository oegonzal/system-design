import { createHash } from 'node:crypto';

import type { NoticeTypeCode } from '@sysdesign/contracts';

/**
 * A search as the package spells it: SAM.gov's documented filters under
 * source-neutral names, dates as ISO `YYYY-MM-DD`. The adapter renders this to
 * the provider's parameter names and formats; the call log stores it as is.
 * The API key is not a field here, so it cannot reach a stored query or a
 * query key by construction.
 */
export interface OpportunityQuery extends QueryFilter {
  postedFrom: string;
  postedTo: string;
  limit: number;
  offset: number;
}

/** The filters a profile slice may declare — everything but the window and paging. */
export interface QueryFilter {
  /** `ptype`. */
  noticeType?: NoticeTypeCode;
  /** `ncode`, 2–6 digits. */
  naics?: string;
  /** `ccode` — the product/service code. */
  psc?: string;
  /** `typeOfSetAside`. */
  setAside?: string;
  title?: string;
  solicitationNumber?: string;
  noticeId?: string;
  /** Place of performance. */
  state?: string;
  zip?: string;
  organizationName?: string;
  organizationCode?: string;
  /** `rdlfrom` / `rdlto`, ISO dates. */
  deadlineFrom?: string;
  deadlineTo?: string;
}

/** The same query however it was assembled: keys sorted, absent filters dropped. */
export function canonicalQuery(query: OpportunityQuery): OpportunityQuery {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries) as unknown as OpportunityQuery;
}

/** sha256 hex over the source id and the canonical query — the call log's lookup key. */
export function queryKey(source: string, query: OpportunityQuery): string {
  return createHash('sha256')
    .update(`${source}\n${JSON.stringify(canonicalQuery(query))}`)
    .digest('hex');
}

/** The following page of the same search. */
export const nextPage = (query: OpportunityQuery): OpportunityQuery => ({
  ...query,
  offset: query.offset + query.limit,
});
