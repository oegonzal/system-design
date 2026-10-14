import { agencyDirectoryEntryOf, horizonRowOf } from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../../core/budget';
import type { SeriesPoint } from '../../../core/ports';
import {
  fetchedOf,
  InMemorySnapshotStore,
  scriptedSpendingSources,
  seriesPointOf,
  type SpendingScript,
} from '../../../core/spending/testing';
import {
  InMemoryAlertLedger,
  InMemoryOpportunityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySourceCallLog,
  InMemoryTargetRepository,
  RecordingAlertSink,
} from '../../../core/testing';
import { AlertRaiser } from '../../alerts/alert-raiser';
import type { Cadence } from '../../app/serve-job';
import { ProfilesService } from '../../profiles/profiles.service';
import { SpendingService } from '../spending.service';
import { SpendingWarmer, type WarmReport } from './spending-warmer';
import { WatchedAwards } from './watched-awards';

/**
 * The warmer over fakes, for its specs: the real service, gate, cache and
 * rules, with every source scripted and every store in memory. No vitest
 * imports: a spec asserts, this only builds.
 */

/** 2026-06-15: period 9 of FY2026. */
export const T0 = new Date('2026-06-15T12:00:00Z');

/** Three complete prior years at 100 a period, this year at 100 through period 8 and 500 in the period in progress — above every prior year's. */
const SERIES: SeriesPoint[] = [
  ...[2023, 2024, 2025].flatMap((fiscalYear) =>
    Array.from({ length: 12 }, (_, index) =>
      seriesPointOf({ fiscalYear, period: index + 1, contracts: 100, idvs: 0, total: 100 }),
    ),
  ),
  ...Array.from({ length: 9 }, (_, index) =>
    seriesPointOf({
      fiscalYear: 2026,
      period: index + 1,
      contracts: index === 8 ? 500 : 100,
      idvs: 0,
      total: index === 8 ? 500 : 100,
    }),
  ),
];

export const SCRIPT: SpendingScript = {
  series: [fetchedOf(SERIES)],
  breakdowns: [
    fetchedOf({
      rows: [
        { id: '1173', code: 'DOD', name: 'Department of Defense', amount: 500 },
        { id: '862', code: 'NASA', name: 'NASA', amount: 300 },
        { id: null, code: null, name: 'unnamed', amount: 1 },
      ],
      hasMore: false,
    }),
  ],
  // One page, answered to both families (the script repeats its last reply): the same award twice, so one alert — the key dedupes.
  ending: [
    fetchedOf({ rows: [horizonRowOf({ endsAt: '2026-07-05' })], rejected: 0, hasMore: false }),
  ],
  catalog: [
    fetchedOf([
      agencyDirectoryEntryOf(),
      agencyDirectoryEntryOf({ agencyId: 862, toptierCode: '080', abbreviation: 'NASA' }),
    ]),
  ],
};

export function harness(options: { script?: SpendingScript; policy?: Cadence } = {}) {
  const clock = () => T0;
  const log = new InMemorySourceCallLog();
  const budget: BudgetPolicy = { ttlMs: 60 * 60 * 1000, pullDeadlineMs: 60_000, buckets: {} };
  const sources = scriptedSpendingSources(options.script ?? SCRIPT);
  const spending = new SpendingService(
    new InMemorySnapshotStore(),
    sources,
    budget,
    new RequestGate(log, budget, clock),
    clock,
    new InMemoryOpportunityRepository(),
  );
  const profiles = new ProfilesService(
    new InMemoryProfileRepository(),
    new InMemorySavedSearchRepository(),
    clock,
  );
  const ledger = new InMemoryAlertLedger();
  const sink = new RecordingAlertSink();
  const targets = new InMemoryTargetRepository();
  const warmer = new SpendingWarmer(
    options.policy ?? { everyMs: null },
    spending,
    profiles,
    new WatchedAwards(spending, targets, ledger, clock),
    new AlertRaiser(ledger, sink, clock),
    clock,
  );
  return {
    warmer,
    sources,
    ledger,
    sink,
    profiles,
    targets,
    operations: () => log.calls.map((call) => call.operation),
  };
}

export const outcomes = (report: WarmReport) =>
  report.lenses.map((lens) => [lens.lens, lens.outcome, 'status' in lens ? lens.status : null]);
