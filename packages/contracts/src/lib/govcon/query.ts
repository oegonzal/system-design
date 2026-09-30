import type { NoticeStatus, NoticeTypeCode, SourceOperation } from './vocab';

/**
 * A search as the govcon package spells it: SAM.gov's documented filters under
 * source-neutral names, dates as ISO `YYYY-MM-DD`. The adapter renders this to
 * the provider's parameter names; the call log stores it as is; a saved
 * search keeps one; the pull report and the web client read it. The API key
 * is not a field here, so it cannot reach a stored query or a query key by
 * construction.
 */
export interface QueryFilter {
  /** `ptype`. */
  noticeType?: NoticeTypeCode;
  /** `ncode`, 2–6 digits — matched exactly by the provider, not by prefix. */
  naics?: string;
  /** `ccode` — the product/service code. */
  psc?: string;
  /** `typeOfSetAside`. */
  setAside?: string;
  /** `status`; unset asks for every lifecycle state. */
  status?: NoticeStatus;
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

/** What each ledger operation asked for — the `query` column, typed by the row's `operation`. */
export interface DescriptionRequest {
  noticeId: string;
}

export interface AttachmentRequest {
  noticeId: string;
  /** Position in the notice's `resourceLinks`. */
  ordinal: number;
}

/** One page of SAM.gov's Contract Awards search: up to a hundred codes of each kind in one request. */
export interface AwardsRequest {
  naics: string[];
  psc: string[];
  /** ISO dates the award was signed between, inclusive. */
  from: string;
  to: string;
  limit: number;
  /** A record offset here; the provider counts pages, and the adapter converts. */
  offset: number;
}

/** One page of USAspending's award search. */
export interface SpendingRequest {
  naics: string[];
  psc: string[];
  from: string;
  to: string;
  page: number;
  limit: number;
}

export interface EntityRequest {
  ueis: string[];
}

export interface ExclusionsRequest {
  uei: string;
}

/** The query shape of every operation, so a ledger row is typed by its `operation`. */
export interface SourceCallQueries {
  search: OpportunityQuery;
  description: DescriptionRequest;
  attachment: AttachmentRequest;
  awards: AwardsRequest;
  spending: SpendingRequest;
  entity: EntityRequest;
  exclusions: ExclusionsRequest;
}

/** `operation` discriminates `query`: one member per source operation. */
export type OperationQuery = {
  [K in SourceOperation]: { operation: K; query: SourceCallQueries[K] };
}[SourceOperation];

export type SourceCallQuery = SourceCallQueries[SourceOperation];

const PAGING_KEYS = ['postedFrom', 'postedTo', 'limit', 'offset'];

/**
 * The filters of a query, for a report row, a saved search or a log line:
 * `naics=332710 status=active`, `naics=332710 page 2`, or `all notices`.
 */
export function describeQuery(
  query: QueryFilter & Partial<Pick<OpportunityQuery, 'limit' | 'offset'>>,
): string {
  const filters = Object.entries(query)
    .filter(([key, value]) => !PAGING_KEYS.includes(key) && value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  const page =
    query.offset !== undefined && query.limit !== undefined && query.offset > 0
      ? ` page ${Math.floor(query.offset / query.limit) + 1}`
      : '';
  return `${filters.length > 0 ? filters.join(' ') : 'all notices'}${page}`;
}

const pageOf = (offset: number, limit: number): string =>
  offset > 0 ? ` page ${Math.floor(offset / limit) + 1}` : '';

/** One line per operation — the discriminator picks the describer, never the query's shape. */
const DESCRIBERS: { [K in SourceOperation]: (query: SourceCallQueries[K]) => string } = {
  search: describeQuery,
  description: (query) => `description ${query.noticeId}`,
  attachment: (query) => `attachment ${query.ordinal + 1} of ${query.noticeId}`,
  awards: (query) =>
    `awards naics=${query.naics.join(',') || '*'} psc=${query.psc.join(',') || '*'} signed ${query.from}..${query.to}${pageOf(query.offset, query.limit)}`,
  spending: (query) =>
    `spending naics=${query.naics.join(',') || '*'} psc=${query.psc.join(',') || '*'} ${query.from}..${query.to} page ${query.page}`,
  entity: (query) =>
    query.ueis.length === 1 ? `entity ${query.ueis[0]}` : `entity ${query.ueis.length} ueis`,
  exclusions: (query) => `exclusions ${query.uei}`,
};

/** A ledger row's query as one line. */
export function describeCall(call: OperationQuery): string {
  return (DESCRIBERS[call.operation] as (query: SourceCallQuery) => string)(call.query);
}
