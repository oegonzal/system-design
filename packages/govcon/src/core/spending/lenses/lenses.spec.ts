import { agencyDirectoryEntryOf, horizonRowOf, NO_FACETS } from '@sysdesign/contracts';

import { RequestGate } from '../../budget';
import { attemptOf, attempted, failure, InMemorySourceCallLog } from '../../testing';
import { SnapshotCache } from '../lens';
import {
  fetchedOf,
  InMemorySnapshotStore,
  scriptedSpendingSources,
  seriesPointOf,
  type SpendingScript,
} from '../testing';
import { agencyLens } from './agency';
import { breakdownLens } from './breakdown';
import type { LensDeps } from './deps';
import { directoryLens } from './directory';
import { freshnessLens } from './freshness';
import { horizonLens } from './horizon';
import { pulseLens } from './pulse';
import { reachLens } from './reach';

const NOW = new Date('2026-06-15T12:00:00Z');
const SCOPE = {
  naics: ['332710'],
  psc: [],
  agency: '097',
  awardFamily: 'both' as const,
  facets: NO_FACETS,
};

function harness(script: SpendingScript = {}) {
  const sources = scriptedSpendingSources(script);
  const log = new InMemorySourceCallLog();
  const gate = new RequestGate(log, { ttlMs: 0, pullDeadlineMs: 60_000, buckets: {} }, () => NOW);
  const cache = new SnapshotCache(new InMemorySnapshotStore(), 60 * 60 * 1000, () => NOW);
  const deps: LensDeps = {
    sources,
    gate,
    now: () => NOW,
    deadlineMs: 60_000,
    read: (spec, query) => cache.read(spec, query),
  };
  return { deps, sources, operations: () => log.calls.map((call) => call.operation) };
}

describe('the spending lenses', () => {
  it('[GOV-11] [GOV-20] every lens spends through the gate under its own operation, counts its HTTP attempts into provenance, and an agency’s offices default to the year its directory entry reports active', async () => {
    const twice = attempted(fetchedOf([seriesPointOf({ fiscalYear: 2026, period: 1 })]), [
      attemptOf(failure('error', 503, 'status 503')),
      attemptOf(fetchedOf([])),
    ]);
    const { deps, sources, operations } = harness({ series: [twice] });

    const pulse = await deps.read(pulseLens(deps), {
      ...SCOPE,
      lookback: 2,
      fiscalYear: 2026,
      period: 9,
    });
    expect(pulse).toMatchObject({
      kind: 'ok',
      body: { fiscalYear: 2026, scope: SCOPE },
      provenance: {
        servedFrom: 'source',
        requests: 2,
        asOf: '2026-06-14',
        disclosures: ['series disclosure'],
      },
    });
    if (pulse.kind !== 'ok') throw new Error('expected ok');
    expect(pulse.body.series).toHaveLength(2 * 12 + 9);
    expect(sources.requests.series[0]).toEqual({
      naics: ['332710'],
      psc: [],
      agency: { toptierCode: '097', name: 'Department of Defense' },
      facets: NO_FACETS,
      awardFamily: 'both',
      group: 'month',
      from: '2023-10-01',
      to: '2026-09-30',
    });
    expect(operations()).toEqual(['agency-directory', 'series', 'series', 'freshness']);

    const agency = await deps.read(agencyLens(deps), {
      toptierCode: '097',
      fiscalYear: 2026,
      awardFamily: 'contracts',
    });
    expect(agency).toMatchObject({
      kind: 'ok',
      body: { name: 'Department of Defense', abbreviation: 'DOD', officesFiscalYear: 2026 },
      provenance: { requests: 2, disclosures: ['budget disclosure', 'offices disclosure'] },
    });
    expect(sources.requests.offices[0]).toMatchObject({
      toptierCode: '097',
      fiscalYear: 2026,
      awardFamily: 'contracts',
      limit: 50,
      page: 1,
    });
    expect(operations().slice(4)).toEqual(['agency-budget', 'agency-offices']);

    // No year asked: the agency's active year as the directory reports it, else the clock's.
    const defaulted = await deps.read(agencyLens(deps), {
      toptierCode: '097',
      fiscalYear: null,
      awardFamily: 'both',
    });
    expect(defaulted).toMatchObject({ kind: 'ok', body: { officesFiscalYear: 2026 } });
    const undated = harness({
      catalog: [
        fetchedOf([agencyDirectoryEntryOf({ activeFiscalYear: null, activeQuarter: null })]),
      ],
    });
    const byClock = await undated.deps.read(agencyLens(undated.deps), {
      toptierCode: '097',
      fiscalYear: null,
      awardFamily: 'both',
    });
    expect(byClock).toMatchObject({ kind: 'ok', body: { officesFiscalYear: 2026 } });
    expect(undated.sources.requests.offices[0]).toMatchObject({ fiscalYear: 2026 });

    expect(await deps.read(directoryLens(deps), {})).toMatchObject({
      provenance: { servedFrom: 'snapshot' },
    });
    expect(await deps.read(freshnessLens(deps), {})).toMatchObject({
      body: { lastUpdated: '2026-06-14' },
      provenance: { servedFrom: 'snapshot' },
    });
  });

  it('[GOV-11] [GOV-27] the reach lens counts contracts cut by cut — one count and one total a cut, then the last cut by size — each through the gate as its own operation, and answers a cut the scope rules out as nothing without a request', async () => {
    const counted = (contracts: number) => fetchedOf({ contracts, idvs: 0 });
    const { deps, sources, operations } = harness({
      counts: [counted(900), counted(600), counted(120), counted(80), counted(30), counted(50)],
      series: [fetchedOf([seriesPointOf({ period: null, total: 7_000 })])],
    });
    const query = {
      naics: SCOPE.naics,
      psc: SCOPE.psc,
      agency: null,
      facets: NO_FACETS,
      from: '2025-06-16',
      to: '2026-06-15',
      lanes: ['NONE', 'SBA'],
    };
    const reach = await deps.read(reachLens(deps), query);
    if (reach.kind !== 'ok') throw new Error('expected ok');
    expect(reach.body.scope).toEqual({ ...SCOPE, agency: null, awardFamily: 'contracts' });
    expect(reach.body.cuts.map((cut) => [cut.id, cut.awards, cut.amount])).toEqual([
      ['new', 900, 7_000],
      ['lanes', 600, 7_000],
      ['standalone', 120, 7_000],
      ['small', 80, 7_000],
    ]);
    expect(reach.body.bands).toEqual([
      { id: 'micro', awards: 30 },
      { id: 'simplified', awards: 50 },
      { id: 'mid', awards: 50 },
      { id: 'large', awards: 50 },
    ]);
    expect(reach.provenance).toMatchObject({ requests: 12, disclosures: ['count disclosure'] });
    expect(operations().filter((operation) => operation === 'award-count')).toHaveLength(8);
    expect(operations().filter((operation) => operation === 'series')).toHaveLength(4);
    // Every request is of contracts, over the window, under the cut's own facets.
    expect(sources.requests.counts[3]).toEqual({
      naics: ['332710'],
      psc: [],
      agency: null,
      facets: {
        recipientSize: 'small',
        placement: 'standalone',
        setAside: ['NONE', 'SBA'],
        amount: null,
        newOnly: true,
      },
      awardFamily: 'contracts',
      from: '2025-06-16',
      to: '2026-06-15',
    });
    expect(sources.requests.counts[4]).toMatchObject({
      facets: { recipientSize: 'small', amount: { min: null, max: 15_000 } },
    });
    expect(sources.requests.series[0]).toMatchObject({
      group: 'fiscal_year',
      awardFamily: 'contracts',
      facets: { newOnly: true },
    });

    // A scope of orders: the stand-alone cut and everything after it cost nothing.
    const orders = harness({ counts: [counted(400), counted(300)] });
    const ruledOut = await orders.deps.read(reachLens(orders.deps), {
      ...query,
      facets: { ...NO_FACETS, placement: 'order' },
    });
    if (ruledOut.kind !== 'ok') throw new Error('expected ok');
    expect(ruledOut.body.cuts.map((cut) => [cut.awards, cut.facets === null])).toEqual([
      [400, false],
      [300, false],
      [0, true],
      [0, true],
    ]);
    expect(ruledOut.body.bands.every((band) => band.awards === 0)).toBe(true);
    expect(orders.sources.requests.counts).toHaveLength(2);

    // The source refusing a count is the lens's refusal.
    const refused = harness({ counts: [failure('rate-limited', 429, 'slow down')] });
    expect(await refused.deps.read(reachLens(refused.deps), query)).toMatchObject({
      kind: 'error',
      outcome: 'rate-limited',
    });
  });

  it('[GOV-20] a scoped lens resolves the agency through the directory snapshot and answers missing for an unknown code without spending', async () => {
    const { deps, operations } = harness();
    const query = { ...SCOPE, agency: '999', lookback: 1, fiscalYear: 2026, period: 9 };
    expect(await deps.read(pulseLens(deps), query)).toEqual({
      kind: 'missing',
      what: 'agency',
      id: '999',
    });
    expect(await deps.read(pulseLens(deps), query)).toMatchObject({ kind: 'missing' });
    expect(operations()).toEqual(['agency-directory']);
  });

  it('[GOV-20] the breakdown total is the scope’s own over the window and shares divide by it; a horizon that fails before any row answers the failure and after rows answers capped', async () => {
    const { deps, operations } = harness({
      breakdowns: [
        fetchedOf({
          rows: [
            { id: '1173', code: 'DOD', name: 'Department of Defense', amount: 60 },
            { id: null, code: 'VA', name: 'Veterans Affairs', amount: 30 },
          ],
          hasMore: true,
        }),
      ],
      series: [fetchedOf([seriesPointOf({ period: null, total: 200 })])],
    });
    const breakdown = await deps.read(breakdownLens(deps), {
      ...SCOPE,
      agency: null,
      category: 'awarding_agency',
      from: '2025-10-01',
      to: '2026-06-15',
    });
    expect(breakdown).toMatchObject({
      kind: 'ok',
      body: {
        total: 200,
        truncated: true,
        rows: [
          { code: 'DOD', share: 0.3 },
          { code: 'VA', share: 0.15 },
        ],
      },
      provenance: { requests: 2 },
    });
    expect(operations()).toEqual(['breakdown', 'series', 'freshness']);

    const refused = harness({ ending: [failure('error', 502, 'status 502')] });
    expect(
      await refused.deps.read(horizonLens(refused.deps), {
        ...SCOPE,
        agency: null,
        months: 12,
        today: '2026-06-15',
      }),
    ).toMatchObject({ kind: 'error', status: 502 });

    const partial = harness({
      ending: [
        // The contracts' one page reaches today and is the last; the IDVs' first page is refused.
        fetchedOf({
          rows: [horizonRowOf({ endsAt: '2026-08-01' })],
          rejected: 1,
          hasMore: false,
        }),
        failure('rate-limited', 429, 'rate limited'),
      ],
    });
    const horizon = await partial.deps.read(horizonLens(partial.deps), {
      ...SCOPE,
      agency: null,
      months: 12,
      today: '2026-06-15',
    });
    expect(horizon).toMatchObject({
      kind: 'ok',
      body: { capped: true, stoppedBy: 'source', completeBefore: null, today: '2026-06-15' },
      provenance: { requests: 2, disclosures: ['horizon disclosure'] },
    });
    if (horizon.kind !== 'ok') throw new Error('expected ok');
    expect(horizon.body.rows).toHaveLength(1);
    expect(horizon.body.buckets).toHaveLength(12);
    expect(horizon.body.buckets[2]).toMatchObject({
      year: 2026,
      month: 8,
      contracts: { count: 1 },
    });
    expect(partial.sources.requests.ending[0]).toMatchObject({
      family: 'contracts',
      from: '2020-10-01',
      to: '2026-06-15',
      limit: 100,
      page: 1,
    });
    // Cut short by the source, so not kept: the next read walks again instead of serving a snapshot.
    const again = await partial.deps.read(horizonLens(partial.deps), {
      ...SCOPE,
      agency: null,
      months: 12,
      today: '2026-06-15',
    });
    expect(again).toMatchObject({ kind: 'error', outcome: 'rate-limited' });
    expect(partial.sources.requests.ending).toHaveLength(3);
  });
});
