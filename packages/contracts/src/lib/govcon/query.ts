import type { NoticeTypeCode } from './vocab';

/**
 * A search as the govcon package spells it: SAM.gov's documented filters under
 * source-neutral names, dates as ISO `YYYY-MM-DD`. The adapter renders this to
 * the provider's parameter names; the call log stores it as is; the pull
 * report and the web client read it. The API key is not a field here, so it
 * cannot reach a stored query or a query key by construction.
 */
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

export interface OpportunityQuery extends QueryFilter {
  postedFrom: string;
  postedTo: string;
  limit: number;
  offset: number;
}

const PAGING_KEYS = ['postedFrom', 'postedTo', 'limit', 'offset'];

/** The filters of a query, for a report row or a log line: `naics=332710 page 2`, or `all notices`. */
export function describeQuery(query: OpportunityQuery): string {
  const filters = Object.entries(query)
    .filter(([key]) => !PAGING_KEYS.includes(key))
    .map(([key, value]) => `${key}=${String(value)}`);
  const page = query.offset > 0 ? ` page ${Math.floor(query.offset / query.limit) + 1}` : '';
  return `${filters.length > 0 ? filters.join(' ') : 'all notices'}${page}`;
}
