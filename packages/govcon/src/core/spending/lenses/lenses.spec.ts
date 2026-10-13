import { horizonRowOf } from '@sysdesign/contracts';

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

const NOW = new Date('2026-06-15T12:00:00Z');
const SCOPE = { naics: ['332710'], psc: [], agency: '097', awardFamily: 'both' as const };

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
  it('[GOV-11] [GOV-20] every lens spends through the gate under its own operation and counts its HTTP attempts into provenance', async () => {
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

    expect(await deps.read(directoryLens(deps), {})).toMatchObject({
      provenance: { servedFrom: 'snapshot' },
    });
    expect(await deps.read(freshnessLens(deps), {})).toMatchObject({
      body: { lastUpdated: '2026-06-14' },
      provenance: { servedFrom: 'snapshot' },
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
        fetchedOf({
          rows: [horizonRowOf({ endsAt: '2026-08-01' })],
          rejected: 1,
          next: { id: 1, sortValue: '1' },
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
      body: { capped: true, stoppedBy: 'source', reachedEndsAt: '2026-08-01', today: '2026-06-15' },
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
      after: null,
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
