import type {
  AgencyBudgetRequest,
  AgencyDirectoryEntry,
  AgencyOfficesRequest,
  AgencyYear,
  BreakdownRequest,
  HorizonRequest,
  HorizonRow,
  SeriesRequest,
  SubAgencyObligations,
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

export interface ObligationSeries extends SpendingPort {
  series(request: SeriesRequest): Promise<Attempted<Fetched<SeriesPoint[]>>>;
}

export interface SpendingBreakdowns extends SpendingPort {
  breakdown(request: BreakdownRequest): Promise<Attempted<Fetched<CategoryPage>>>;
}

export interface EndingAwards extends SpendingPort {
  page(request: HorizonRequest): Promise<Attempted<Fetched<EndingAwardsPage>>>;
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

export interface DataFreshness extends SpendingPort {
  /** The source's "award data as of" date, ISO. */
  lastUpdated(): Promise<Attempted<Fetched<string>>>;
}

/** The seven, as one injected bundle: one token, every capability. */
export interface SpendingSources {
  series: ObligationSeries;
  breakdowns: SpendingBreakdowns;
  ending: EndingAwards;
  budgets: AgencyBudgets;
  offices: AgencyOffices;
  catalog: AgencyCatalog;
  freshness: DataFreshness;
}
