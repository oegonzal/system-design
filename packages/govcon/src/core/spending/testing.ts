import {
  agencyDirectoryEntryOf,
  type AgencyDirectoryEntry,
  type AgencyYear,
  type SpendingLens,
} from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';
import type {
  CategoryPage,
  EndingAwardsPage,
  OfficesPage,
  SeriesPoint,
  SnapshotRow,
  SpendingSnapshotStore,
  SpendingSources,
} from '../ports';
import { attempted, type Scripted } from '../testing';

/**
 * Pure fakes for the spending lenses: a snapshot store in memory, and the
 * seven USAspending ports scripted per capability. No vitest imports, so a
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

/** Per-port scripted replies, each answered in order and repeating the last. */
export interface SpendingScript {
  series?: readonly Scripted<SeriesPoint[]>[];
  breakdowns?: readonly Scripted<CategoryPage>[];
  ending?: readonly Scripted<EndingAwardsPage>[];
  budgets?: readonly Scripted<AgencyYear[]>[];
  offices?: readonly Scripted<OfficesPage>[];
  catalog?: readonly Scripted<AgencyDirectoryEntry[]>[];
  freshness?: readonly Scripted<string>[];
}

export interface ScriptedSpendingSources extends SpendingSources {
  /** Every request each port saw, in order. */
  requests: Record<keyof SpendingSources, unknown[]>;
}

const asAttempted = <T>(reply: Scripted<T>): Attempted<Fetched<T>> =>
  'attempts' in reply ? reply : attempted(reply);

function replier<T>(replies: readonly Scripted<T>[], requests: unknown[]) {
  let call = 0;
  return async (request: unknown = {}): Promise<Attempted<Fetched<T>>> => {
    requests.push(request);
    const reply = replies[Math.min(call, replies.length - 1)];
    call += 1;
    if (!reply) throw new Error('scriptedSpendingSources: no replies');
    return asAttempted(reply);
  };
}

/**
 * The seven ports over a script; an unscripted port answers something empty
 * and sensible (the catalog knows one agency, DoD `097`, so a scoped lens can
 * resolve it). Disclosures are one declared line per port, so a spec can see
 * them carried through.
 */
export function scriptedSpendingSources(script: SpendingScript = {}): ScriptedSpendingSources {
  const id = 'usaspending';
  const requests: ScriptedSpendingSources['requests'] = {
    series: [],
    breakdowns: [],
    ending: [],
    budgets: [],
    offices: [],
    catalog: [],
    freshness: [],
  };
  const series = replier(script.series ?? [fetchedOf<SeriesPoint[]>([])], requests.series);
  const breakdowns = replier(
    script.breakdowns ?? [fetchedOf<CategoryPage>({ rows: [], hasMore: false })],
    requests.breakdowns,
  );
  const ending = replier(
    script.ending ?? [fetchedOf<EndingAwardsPage>({ rows: [], rejected: 0, next: null })],
    requests.ending,
  );
  const budgets = replier(script.budgets ?? [fetchedOf<AgencyYear[]>([])], requests.budgets);
  const offices = replier(
    script.offices ?? [fetchedOf<OfficesPage>({ subAgencies: [], hasMore: false })],
    requests.offices,
  );
  const catalog = replier(
    script.catalog ?? [fetchedOf([agencyDirectoryEntryOf()])],
    requests.catalog,
  );
  const freshness = replier(script.freshness ?? [fetchedOf('2026-06-14')], requests.freshness);
  return {
    requests,
    series: { id, disclosures: ['series disclosure'], series },
    breakdowns: { id, disclosures: ['breakdown disclosure'], breakdown: breakdowns },
    ending: { id, disclosures: ['horizon disclosure'], page: ending },
    budgets: { id, disclosures: ['budget disclosure'], budgets },
    offices: { id, disclosures: ['offices disclosure'], offices },
    catalog: { id, disclosures: ['catalog disclosure'], agencies: () => catalog() },
    freshness: { id, disclosures: [], lastUpdated: () => freshness() },
  };
}
