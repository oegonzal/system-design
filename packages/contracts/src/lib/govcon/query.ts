import type {
  AwardFamily,
  AwardFamilyChoice,
  BreakdownCategory,
  NoticeStatus,
  NoticeTypeCode,
  SourceOperation,
} from './vocab';

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

/** An awarding agency by its toptier code and the name USAspending filters by. */
export interface AgencyRef {
  toptierCode: string;
  name: string;
}

/** The codes and the agency every USAspending scope request carries. */
export interface ScopeRequest {
  naics: string[];
  psc: string[];
  agency: AgencyRef | null;
}

export type SeriesGroup = 'month' | 'fiscal_year';

/** One `spending_over_time` call: obligations by fiscal period or year over an action-date window. */
export interface SeriesRequest extends ScopeRequest {
  awardFamily: AwardFamilyChoice;
  group: SeriesGroup;
  /** ISO dates, inclusive, on the action date. */
  from: string;
  to: string;
}

/** One page of `spending_by_category/<category>` over an action-date window. */
export interface BreakdownRequest extends ScopeRequest {
  awardFamily: AwardFamilyChoice;
  category: BreakdownCategory;
  from: string;
  to: string;
  limit: number;
  page: number;
}

/** One page of the horizon walk: one family, newest-ending first, by page number — the source's keyset cursor is not used. */
export interface HorizonRequest extends ScopeRequest {
  family: AwardFamily;
  /** The action-date window that bounds the universe walked. */
  from: string;
  to: string;
  limit: number;
  page: number;
}

export interface AgencyBudgetRequest {
  toptierCode: string;
}

/** One page of an agency's sub-agencies and offices for a fiscal year. */
export interface AgencyOfficesRequest {
  toptierCode: string;
  fiscalYear: number;
  awardFamily: AwardFamilyChoice;
  limit: number;
  page: number;
}

/** An operation that asks for nothing: the agency directory, the source's freshness. */
export type NoRequest = Record<string, never>;

/** The query shape of every operation, so a ledger row is typed by its `operation`. */
export interface SourceCallQueries {
  search: OpportunityQuery;
  description: DescriptionRequest;
  attachment: AttachmentRequest;
  awards: AwardsRequest;
  spending: SpendingRequest;
  entity: EntityRequest;
  exclusions: ExclusionsRequest;
  series: SeriesRequest;
  breakdown: BreakdownRequest;
  horizon: HorizonRequest;
  'agency-budget': AgencyBudgetRequest;
  'agency-offices': AgencyOfficesRequest;
  'agency-directory': NoRequest;
  freshness: NoRequest;
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

const scopeOf = (query: ScopeRequest): string =>
  `naics=${query.naics.join(',') || '*'} psc=${query.psc.join(',') || '*'} agency=${query.agency?.toptierCode ?? '*'}`;

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
  series: (query) =>
    `series ${query.awardFamily} by ${query.group} ${scopeOf(query)} ${query.from}..${query.to}`,
  breakdown: (query) =>
    `breakdown ${query.category} ${query.awardFamily} ${scopeOf(query)} ${query.from}..${query.to} page ${query.page}`,
  horizon: (query) =>
    `horizon ${query.family} ${scopeOf(query)} ${query.from}..${query.to} page ${query.page}`,
  'agency-budget': (query) => `agency budget ${query.toptierCode}`,
  'agency-offices': (query) =>
    `agency offices ${query.toptierCode} FY${query.fiscalYear} ${query.awardFamily} page ${query.page}`,
  'agency-directory': () => 'agency directory',
  freshness: () => 'freshness',
};

/** A ledger row's query as one line. */
export function describeCall(call: OperationQuery): string {
  return (DESCRIBERS[call.operation] as (query: SourceCallQuery) => string)(call.query);
}
