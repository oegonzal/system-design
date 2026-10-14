import {
  agencyDirectoryEntryOf,
  type AgencyDirectoryEntry,
  type AgencyYear,
  type AwardOrders,
  type AwardSubcontract,
  type FacetId,
  type SpendingLens,
} from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';
import type {
  AwardCounts,
  AwardRecord,
  CategoryPage,
  EndingAwardsPage,
  OfficesPage,
  PublicationLag,
  SeriesPoint,
  SnapshotRow,
  SpendingSnapshotStore,
  SpendingSources,
  SubcontractPage,
} from '../ports';
import { asAttempted, type Scripted } from '../testing';

/**
 * Pure fakes for the spending lenses: a snapshot store in memory, and the
 * USAspending ports scripted per capability. No vitest imports, so a
 * spec anywhere — the core, the service, the HTTP suite — can lean on them.
 */
export class InMemorySnapshotStore implements SpendingSnapshotStore {
  readonly rows = new Map<string, SnapshotRow>();
  /** When set, every method throws — the "store unavailable" branch. */
  failing: Error | null = null;

  async find(lens: SpendingLens, queryKey: string): Promise<SnapshotRow | null> {
    this.fail();
    return this.rows.get(`${lens}:${queryKey}`) ?? null;
  }

  async put(row: SnapshotRow): Promise<void> {
    this.fail();
    this.rows.set(`${row.lens}:${row.queryKey}`, row);
  }

  private fail(): void {
    if (this.failing) throw this.failing;
  }
}

export const fetchedOf = <T>(value: T, recordCount: number | null = null): Fetched<T> => ({
  kind: 'ok',
  value,
  recordCount,
  totalRecords: null,
});

export const seriesPointOf = (overrides: Partial<SeriesPoint> = {}): SeriesPoint => ({
  fiscalYear: 2026,
  period: 1,
  contracts: 1_000,
  idvs: 100,
  total: 1_100,
  ...overrides,
});

export const agencyYearOf = (overrides: Partial<AgencyYear> = {}): AgencyYear => ({
  fiscalYear: 2026,
  budgetaryResources: 1_000_000,
  obligated: 600_000,
  outlayed: 500_000,
  byPeriod: [
    { period: 2, obligated: 100_000 },
    { period: 3, obligated: 120_000 },
  ],
  ...overrides,
});

/** What each port answers, by the script's key. */
interface ScriptValues {
  series: SeriesPoint[];
  breakdowns: CategoryPage;
  ending: EndingAwardsPage;
  counts: AwardCounts;
  subawardCounts: number;
  subawards: SubcontractPage;
  awardDetails: AwardRecord | null;
  awardOrders: AwardOrders;
  awardSubawards: AwardSubcontract[];
  budgets: AgencyYear[];
  offices: OfficesPage;
  catalog: AgencyDirectoryEntry[];
  freshness: string;
}
type Port = keyof ScriptValues;

/** Per-port scripted replies, each answered in order and repeating the last. */
export type SpendingScript = { [K in Port]?: readonly Scripted<ScriptValues[K]>[] };

export interface ScriptedSpendingSources extends SpendingSources {
  /** Every request each port saw, in order. */
  requests: Record<Port, unknown[]>;
  /** The replies from the top again — the script given, or the one it was built with; what a suite does between tests. */
  script(next?: SpendingScript): void;
}

/** An unscripted port answers something empty and sensible; the catalog knows one agency, DoD `097`, so a scoped lens can resolve it. */
const withDefaults = (script: SpendingScript): Required<SpendingScript> => ({
  series: script.series ?? [fetchedOf<SeriesPoint[]>([])],
  breakdowns: script.breakdowns ?? [fetchedOf<CategoryPage>({ rows: [], hasMore: false })],
  ending: script.ending ?? [fetchedOf<EndingAwardsPage>({ rows: [], rejected: 0, hasMore: false })],
  counts: script.counts ?? [fetchedOf<AwardCounts>({ contracts: 0, idvs: 0 })],
  subawardCounts: script.subawardCounts ?? [fetchedOf(0)],
  subawards: script.subawards ?? [
    fetchedOf<SubcontractPage>({ rows: [], rejected: 0, hasMore: false }),
  ],
  awardDetails: script.awardDetails ?? [fetchedOf<AwardRecord | null>(null)],
  awardOrders: script.awardOrders ?? [
    fetchedOf<AwardOrders>({ count: 0, obligated: 0, vehicles: 0 }),
  ],
  awardSubawards: script.awardSubawards ?? [fetchedOf<AwardSubcontract[]>([])],
  budgets: script.budgets ?? [fetchedOf<AgencyYear[]>([])],
  offices: script.offices ?? [fetchedOf<OfficesPage>({ subAgencies: [], hasMore: false })],
  catalog: script.catalog ?? [fetchedOf([agencyDirectoryEntryOf()])],
  freshness: script.freshness ?? [fetchedOf('2026-06-14')],
});

/**
 * Every port over a script, answered in order and repeating the last
 * reply; `script()` starts them over. Disclosures are one declared line per
 * port, so a spec can see them carried through; no agency publishes late
 * unless the spec declares the lags.
 */
export function scriptedSpendingSources(
  script: SpendingScript = {},
  publicationLags: readonly PublicationLag[] = [],
  unsupportedFacets: readonly FacetId[] = [],
): ScriptedSpendingSources {
  const id = 'usaspending';
  const requests: Record<Port, unknown[]> = {
    series: [],
    breakdowns: [],
    ending: [],
    counts: [],
    subawardCounts: [],
    subawards: [],
    awardDetails: [],
    awardOrders: [],
    awardSubawards: [],
    budgets: [],
    offices: [],
    catalog: [],
    freshness: [],
  };
  const calls: Record<Port, number> = {
    series: 0,
    breakdowns: 0,
    ending: 0,
    counts: 0,
    subawardCounts: 0,
    subawards: 0,
    awardDetails: 0,
    awardOrders: 0,
    awardSubawards: 0,
    budgets: 0,
    offices: 0,
    catalog: 0,
    freshness: 0,
  };
  let current = withDefaults(script);
  const replier =
    <K extends Port>(port: K) =>
    async (request: unknown = {}): Promise<Attempted<Fetched<ScriptValues[K]>>> => {
      requests[port].push(request);
      const replies = current[port] as readonly Scripted<ScriptValues[K]>[];
      const reply = replies[Math.min(calls[port], replies.length - 1)];
      calls[port] += 1;
      if (!reply) throw new Error('scriptedSpendingSources: no replies');
      return asAttempted(reply);
    };
  return {
    requests,
    script(next = script) {
      current = withDefaults(next);
      for (const port of Object.keys(calls) as Port[]) calls[port] = 0;
    },
    series: { id, disclosures: ['series disclosure'], series: replier('series') },
    breakdowns: { id, disclosures: ['breakdown disclosure'], breakdown: replier('breakdowns') },
    ending: { id, disclosures: ['horizon disclosure'], page: replier('ending') },
    counts: { id, disclosures: ['count disclosure'], count: replier('counts') },
    subcontracts: {
      id,
      disclosures: ['subcontract disclosure'],
      unsupportedFacets,
      count: replier('subawardCounts'),
      page: replier('subawards'),
    },
    awards: {
      id,
      disclosures: ['award disclosure'],
      detail: replier('awardDetails'),
      orders: replier('awardOrders'),
      subcontracts: replier('awardSubawards'),
    },
    budgets: { id, disclosures: ['budget disclosure'], budgets: replier('budgets') },
    offices: { id, disclosures: ['offices disclosure'], offices: replier('offices') },
    catalog: { id, disclosures: ['catalog disclosure'], agencies: replier('catalog') },
    freshness: { id, disclosures: [], publicationLags, lastUpdated: replier('freshness') },
  };
}
