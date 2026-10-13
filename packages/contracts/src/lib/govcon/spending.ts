import type { ApiResponse } from '../envelope';
import type { FacetQuery, SpendingFacets } from './facets';
import type { FiscalPeriod } from './fiscal';
import type { Opportunity } from './opportunity';
import type { AwardSizeBandId } from './thresholds';
import type { AwardFamily, AwardFamilyChoice, BreakdownCategory, ReachCutId } from './vocab';

/**
 * Spending research over USAspending: four lenses on one scope. Every answer
 * is a snapshot the service took through the request gate, so each carries
 * its provenance — when it was fetched, how fresh the source said it was,
 * whether it was served from the store, how many attempts it cost, and the
 * provider facts the adapter declares about the data.
 */

/** What every lens is scoped by: code families, one awarding agency, one or both award families, and the facets that narrow those. */
export interface SpendingScope {
  /** NAICS codes or families, 2–6 digits; a shorter code is the whole family. */
  naics: string[];
  /** PSC codes or families, 1–4 characters. */
  psc: string[];
  /** The awarding agency's toptier code (`097`), or every agency. */
  agency: string | null;
  awardFamily: AwardFamilyChoice;
  facets: SpendingFacets;
}

/** Where an answer came from: fetched now, the day's snapshot, or an older snapshot because the refresh failed. */
export type ServedFrom = 'source' | 'snapshot' | 'stale';

export interface Provenance {
  /** The upstream's id — the ledger's `source`. */
  source: string;
  /** ISO 8601 — when the snapshot was taken. */
  fetchedAt: string;
  /** ISO date — the source's own "data as of"; null when the source does not say. */
  asOf: string | null;
  servedFrom: ServedFrom;
  /** HTTP attempts the snapshot cost, as the ledger counted them. */
  requests: number;
  /** Provider facts the adapter declares about this data, rendered verbatim. */
  disclosures: string[];
}

// ---------------------------------------------------------------------------
// Pulse — obligations by fiscal period, and the remaining periods projected.

export interface PeriodObligations extends FiscalPeriod {
  contracts: number;
  idvs: number;
  total: number;
  /** The period in progress: its amount is what has been reported so far. */
  partial: boolean;
  /** The period reaches past what the source has published for the scope: awards an agency publishes late are still to come. */
  unpublished: boolean;
}

/** A period whose amount is final as far as the source can say: ended, and wholly published. */
export const isSettled = (point: PeriodObligations): boolean =>
  !point.partial && !point.unpublished;

/**
 * Awards a scope counts that the source publishes late: which agencies, by
 * how many days after signing, and the last day whose awards are all in.
 * Amounts after that day are still filling in.
 */
export interface PublicationDelay {
  /** The agencies that publish late, by name. */
  agencies: string[];
  days: number;
  /** ISO: awards signed on or before this day are published. */
  completeThrough: string;
}

export interface ProjectedPeriod extends FiscalPeriod {
  /** The mean of the lookback years' amounts in this period. */
  expected: number;
  /** `expected` scaled by this year's run rate; null before the base periods are complete. */
  scaled: number | null;
  low: number;
  high: number;
}

/** A declared, deterministic projection of the fiscal year's remaining periods. */
export interface Projection {
  method: 'seasonal-mean';
  /** The complete prior fiscal years the mean was taken over. */
  lookbackFiscalYears: number[];
  /** Settled periods of the current year the run rate rests on. */
  basePeriods: number;
  /** This year's base over the lookback mean's base; null while the base is too short. */
  ratio: number | null;
  periods: ProjectedPeriod[];
}

export interface SpendingPulse {
  scope: SpendingScope;
  /** The fiscal year the answer was computed in. */
  fiscalYear: number;
  series: PeriodObligations[];
  /** Null without a complete prior fiscal year to project from. */
  projection: Projection | null;
  /** Null when no agency the scope counts publishes late. */
  delay: PublicationDelay | null;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Breakdown — who buys, who wins, what codes and where, over a window.

export interface BreakdownRow {
  /** The source's own key for the row, when it has one. */
  id: string | null;
  /** A displayable code — an abbreviation, a NAICS, a state. */
  code: string | null;
  name: string;
  amount: number;
  /** `amount` over the scope's total for the window, 0..1. */
  share: number;
}

export interface SpendingBreakdown {
  scope: SpendingScope;
  category: BreakdownCategory;
  /** ISO dates, inclusive, on the action date. */
  from: string;
  to: string;
  /** The scope's own obligations over the window — what the shares divide by. */
  total: number;
  rows: BreakdownRow[];
  /** More rows exist beyond the declared bound. */
  truncated: boolean;
  /** Null unless the window reaches past what an agency the scope counts has published. */
  delay: PublicationDelay | null;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Reach — how much of a scope's new work a firm could have competed for.

export interface ReachCut {
  id: ReachCutId;
  /** The facets the cut counted under: the scope's own, narrowed this far. Null when they leave the cut nothing to count. */
  facets: SpendingFacets | null;
  awards: number;
  /** Obligated on those awards inside the window. */
  amount: number;
}

export interface ReachBand {
  id: AwardSizeBandId;
  awards: number;
}

/**
 * A scope's new contracts over a window, cut down step by step to the ones a
 * firm with the given lanes could have won as it stands. Contracts only: a
 * vehicle is not work until an order is placed under it.
 */
export interface SpendingReach {
  scope: SpendingScope;
  /** ISO dates, inclusive, on the action date. */
  from: string;
  to: string;
  /** The set-aside lanes the count was taken for. */
  lanes: string[];
  /** In `REACH_CUTS` order; each narrows the one before it. */
  cuts: ReachCut[];
  /** The last cut by award size; the bands add up to it. */
  bands: ReachBand[];
  /** Null unless the window reaches past what an agency the scope counts has published. */
  delay: PublicationDelay | null;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Horizon — active awards ending inside the coming months.

export interface FamilyTotals {
  count: number;
  amount: number;
}

/** One calendar month of the horizon, per award family. */
export type HorizonBucket = Record<AwardFamily, FamilyTotals> & { year: number; month: number };

export type HorizonStop = 'pages' | 'deadline' | 'source';

export interface HorizonRow {
  externalId: string;
  piid: string | null;
  family: AwardFamily;
  /** The source's own award type, e.g. `PURCHASE ORDER`. */
  typeDescription: string | null;
  recipientName: string | null;
  recipientUei: string | null;
  /** Obligated so far; an IDV's is often zero. */
  amount: number;
  /** ISO date — the current end date, or an IDV's last date to order. */
  endsAt: string;
  agencyPath: string | null;
  /** `toptier.subtier` codes. */
  agencyCode: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  description: string | null;
}

/** What the horizon lens computes and the snapshot stores. */
export interface HorizonBody {
  scope: SpendingScope;
  /** ISO date the walk counted from. */
  today: string;
  months: number;
  buckets: HorizonBucket[];
  /** The soonest-ending rows inside the window, bounded. */
  rows: HorizonRow[];
  /** The walk ended before it covered the window; `stoppedBy` names what ended it. */
  capped: boolean;
  stoppedBy: HorizonStop | null;
  /** When capped: awards ending before this date are all here — the near end of the window — and later months may be missing; null when no part of the window is complete. */
  completeBefore: string | null;
}

/** A stored notice as the horizon names it beside an expiring award. */
export interface NoticeRef {
  noticeId: string;
  title: string;
  solicitationNumber: string | null;
  noticeType: string | null;
  /** ISO 8601, when the notice states one. */
  responseDeadlineAt: string | null;
  agencyPath: string | null;
}

/** The reference a notice is named by, out of its stored record. */
export const noticeRefOf = ({
  noticeId,
  title,
  solicitationNumber,
  noticeType,
  responseDeadlineAt,
  agencyPath,
}: Opportunity): NoticeRef => ({
  noticeId,
  title,
  solicitationNumber,
  noticeType,
  responseDeadlineAt,
  agencyPath,
});

/** The open notices sharing one expiring award's NAICS and buyer; a row with none is absent. */
export interface HorizonNoticeMatch {
  externalId: string;
  notices: NoticeRef[];
}

/**
 * The wire answer: the body, the open stored notices joined to its rows on
 * every read — never stored — and the provenance.
 */
export interface SpendingHorizon extends HorizonBody {
  openNotices: HorizonNoticeMatch[];
  /** More open notices in the rows' codes exist than the declared bound read. */
  openNoticesCapped: boolean;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Agencies — the directory, and one agency's budget by year and offices.

export interface AgencyDirectoryEntry {
  /** USAspending's own id, the key its category breakdowns answer with. */
  agencyId: number;
  toptierCode: string;
  abbreviation: string;
  name: string;
  budgetAuthority: number;
  obligated: number;
  outlayed: number;
  activeFiscalYear: number | null;
  activeQuarter: number | null;
}

export interface AgencyDirectory {
  entries: AgencyDirectoryEntry[];
  provenance: Provenance;
}

export interface PeriodObligated {
  period: number;
  obligated: number;
}

export interface AgencyYear {
  fiscalYear: number;
  budgetaryResources: number | null;
  obligated: number | null;
  outlayed: number | null;
  /** The periods the source reported, ascending — monthly in recent years, quarterly before. */
  byPeriod: PeriodObligated[];
}

export interface OfficeObligations {
  code: string | null;
  name: string;
  obligations: number;
  transactions: number;
  newAwards: number;
}

export interface SubAgencyObligations extends OfficeObligations {
  abbreviation: string | null;
  offices: OfficeObligations[];
}

export interface AgencyOutlook {
  toptierCode: string;
  name: string;
  abbreviation: string | null;
  years: AgencyYear[];
  officesFiscalYear: number;
  awardFamily: AwardFamilyChoice;
  subAgencies: SubAgencyObligations[];
  /** More sub-agencies exist beyond the declared bound. */
  truncated: boolean;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// The wire: queries and envelopes.

/** The scope as a query string: lists are comma-joined on the wire and read back as lists, and a facet travels only when set. */
export interface ScopeQuery extends FacetQuery {
  naics?: string[];
  psc?: string[];
  agency?: string;
  awardFamily?: AwardFamilyChoice;
}

export interface SpendingPulseQuery extends ScopeQuery {
  /** Prior fiscal years to show and project from. */
  lookback?: number;
}

export interface SpendingBreakdownQuery extends ScopeQuery {
  category: BreakdownCategory;
  from: string;
  to: string;
}

export interface SpendingHorizonQuery extends ScopeQuery {
  months?: number;
}

/** Reach names no award family: it counts contracts. */
export interface SpendingReachQuery extends Omit<ScopeQuery, 'awardFamily'> {
  from: string;
  to: string;
  /** The set-aside lanes to count for; none named counts every lane. */
  lanes?: string[];
}

export interface AgencyOutlookQuery {
  fiscalYear?: number;
  awardFamily?: AwardFamilyChoice;
}

export type GetSpendingPulseResponse = ApiResponse<SpendingPulse>;
export type GetSpendingBreakdownResponse = ApiResponse<SpendingBreakdown>;
export type GetSpendingHorizonResponse = ApiResponse<SpendingHorizon>;
export type GetSpendingReachResponse = ApiResponse<SpendingReach>;
export type GetAgenciesResponse = ApiResponse<AgencyDirectory>;
export type GetAgencyOutlookResponse = ApiResponse<AgencyOutlook>;
