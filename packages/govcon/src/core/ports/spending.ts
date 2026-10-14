import type {
  AgencyBudgetRequest,
  AgencyDirectoryEntry,
  AgencyOfficesRequest,
  AgencyYear,
  AwardBody,
  AwardDetailRequest,
  AwardOrders,
  AwardSubawardsRequest,
  AwardSubcontract,
  BreakdownRequest,
  CountRequest,
  FacetId,
  FirmRef,
  HorizonRequest,
  HorizonRow,
  SeriesRequest,
  SubAgencyObligations,
  SubawardScopeRequest,
  SubawardsRequest,
} from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';

/**
 * The spending capabilities, one port each, as USAspending answers them —
 * free, still ledgered. Every port declares the provider facts that bear on
 * its data (`disclosures`), so an answer can carry them verbatim instead of
 * a client knowing them.
 */
export interface SpendingPort {
  /** The upstream's id — the ledger's `source`. */
  readonly id: string;
  readonly disclosures: readonly string[];
}

/** Obligations in one fiscal period (or one year, when `period` is null). */
export interface SeriesPoint {
  fiscalYear: number;
  period: number | null;
  contracts: number;
  idvs: number;
  total: number;
}

export interface CategoryRow {
  id: string | null;
  code: string | null;
  name: string;
  amount: number;
}

export interface CategoryPage {
  rows: CategoryRow[];
  hasMore: boolean;
}

/** One page of awards, newest-ending first, and whether another page follows. */
export interface EndingAwardsPage {
  rows: HorizonRow[];
  /** Records the source returned that did not normalize — counted, never kept. */
  rejected: number;
  hasMore: boolean;
}

export interface OfficesPage {
  subAgencies: SubAgencyObligations[];
  hasMore: boolean;
}

/** How many awards a scope holds, by family. */
export interface AwardCounts {
  contracts: number;
  idvs: number;
}

export interface ObligationSeries extends SpendingPort {
  series(request: SeriesRequest): Promise<Attempted<Fetched<SeriesPoint[]>>>;
}

export interface SpendingBreakdowns extends SpendingPort {
  breakdown(request: BreakdownRequest): Promise<Attempted<Fetched<CategoryPage>>>;
}

export interface EndingAwards extends SpendingPort {
  page(request: HorizonRequest): Promise<Attempted<Fetched<EndingAwardsPage>>>;
}

export interface SpendingCounts extends SpendingPort {
  count(request: CountRequest): Promise<Attempted<Fetched<AwardCounts>>>;
}

/** One subcontract as its prime reported it. */
export interface SubcontractRow {
  prime: FirmRef;
  subcontractor: FirmRef;
  /** The prime award it was placed under, by the source's own id. */
  primeAwardId: string | null;
  amount: number;
  /** ISO date. */
  date: string | null;
  /** The product service code of the prime award. */
  pscCode: string | null;
}

/** One page of subcontracts, most recent first, and whether another follows. */
export interface SubcontractPage {
  rows: SubcontractRow[];
  /** Records the source returned that did not normalize — counted, never kept. */
  rejected: number;
  hasMore: boolean;
}

export interface Subcontracts extends SpendingPort {
  /** The facets a subcontract search cannot honour — a provider fact the adapter declares, so a lens reports the scope it really read. */
  readonly unsupportedFacets: readonly FacetId[];
  count(request: SubawardScopeRequest): Promise<Attempted<Fetched<number>>>;
  page(request: SubawardsRequest): Promise<Attempted<Fetched<SubcontractPage>>>;
}

/** One award's own record, less the subcontractors read beside it. */
export type AwardRecord = Omit<AwardBody, 'orders' | 'subcontracts'>;

export interface AwardRecords extends SpendingPort {
  /** Null when the source has no award by that id. */
  detail(request: AwardDetailRequest): Promise<Attempted<Fetched<AwardRecord | null>>>;
  /** What was ordered under a vehicle. */
  orders(request: AwardDetailRequest): Promise<Attempted<Fetched<AwardOrders>>>;
  /** The largest subcontracts reported under it, largest first. */
  subcontracts(request: AwardSubawardsRequest): Promise<Attempted<Fetched<AwardSubcontract[]>>>;
}

export interface AgencyBudgets extends SpendingPort {
  budgets(request: AgencyBudgetRequest): Promise<Attempted<Fetched<AgencyYear[]>>>;
}

export interface AgencyOffices extends SpendingPort {
  offices(request: AgencyOfficesRequest): Promise<Attempted<Fetched<OfficesPage>>>;
}

export interface AgencyCatalog extends SpendingPort {
  agencies(): Promise<Attempted<Fetched<AgencyDirectoryEntry[]>>>;
}

/** An agency whose awards the source publishes late, by its toptier code, and by how many days after they are signed. */
export interface PublicationLag {
  toptierCode: string;
  name: string;
  days: number;
}

export interface DataFreshness extends SpendingPort {
  /** The agencies whose awards arrive late — a provider fact the adapter declares, never asked for. */
  readonly publicationLags: readonly PublicationLag[];
  /** The source's "award data as of" date, ISO. */
  lastUpdated(): Promise<Attempted<Fetched<string>>>;
}

/** Every capability as one injected bundle: one token for all of them. */
export interface SpendingSources {
  series: ObligationSeries;
  breakdowns: SpendingBreakdowns;
  ending: EndingAwards;
  counts: SpendingCounts;
  subcontracts: Subcontracts;
  awards: AwardRecords;
  budgets: AgencyBudgets;
  offices: AgencyOffices;
  catalog: AgencyCatalog;
  freshness: DataFreshness;
}
