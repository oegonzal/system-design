import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  agencyDirectoryEntryOf,
  horizonRowOf,
  NO_FACETS,
  noticeRefOf,
  opportunityOf,
} from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { PublicationLag } from '../../core/ports';
import {
  fetchedOf,
  InMemorySnapshotStore,
  scriptedSpendingSources,
  seriesPointOf,
  type SpendingScript,
} from '../../core/spending/testing';
import { failure, InMemoryOpportunityRepository, InMemorySourceCallLog } from '../../core/testing';
import { SpendingService } from './spending.service';

const T0 = new Date('2026-06-15T12:00:00Z');

interface HarnessOptions {
  script?: SpendingScript;
  policy?: Partial<BudgetPolicy>;
  /** Advances the clock on every read, so a wall-clock deadline can pass inside one call. */
  tickMs?: number;
  notices?: InMemoryOpportunityRepository;
  /** The agencies the source publishes late; none unless a test declares them. */
  lags?: readonly PublicationLag[];
}

function harness({
  script = {},
  policy = {},
  tickMs = 0,
  notices = new InMemoryOpportunityRepository(),
  lags = [],
}: HarnessOptions = {}) {
  let now = T0;
  const clock = () => {
    now = new Date(now.getTime() + tickMs);
    return now;
  };
  const log = new InMemorySourceCallLog();
  const budget: BudgetPolicy = {
    ttlMs: 60 * 60 * 1000,
    pullDeadlineMs: 60_000,
    buckets: {},
    ...policy,
  };
  const sources = scriptedSpendingSources(script, lags);
  const store = new InMemorySnapshotStore();
  const service = new SpendingService(
    store,
    sources,
    budget,
    new RequestGate(log, budget, clock),
    clock,
    notices,
  );
  return {
    service,
    sources,
    store,
    notices,
    operations: () => log.calls.map((call) => call.operation),
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

/** A scope as the request schema hands it on: no facet set. */
const scope = {
  naics: ['332710'],
  psc: [],
  awardFamily: 'both' as const,
  setAside: [],
  newOnly: false,
};

describe('the spending service', () => {
  it('[GOV-20] answers the pulse from the source once, then from the snapshot inside the TTL with no new ledger row, keyed on the fiscal period the clock names', async () => {
    const { service, operations, advance } = harness({
      script: { series: [fetchedOf([seriesPointOf({ fiscalYear: 2026, period: 1, total: 5 })])] },
    });
    const first = await service.pulse({ ...scope, lookback: 3 });
    expect(first).toMatchObject({
      fiscalYear: 2026,
      scope: { naics: ['332710'], psc: [], agency: null, awardFamily: 'both', facets: NO_FACETS },
      provenance: { servedFrom: 'source', requests: 1, asOf: '2026-06-14' },
    });
    expect(first.series).toHaveLength(3 * 12 + 9);
    expect(first.series.at(-1)).toMatchObject({ fiscalYear: 2026, period: 9, partial: true });
    expect(operations()).toEqual(['series', 'freshness']);

    advance(10 * 60 * 1000);
    const second = await service.pulse({ ...scope, lookback: 3 });
    expect(second.provenance.servedFrom).toBe('snapshot');
    expect(operations()).toEqual(['series', 'freshness']);

    expect((await service.pulse({ ...scope, lookback: 2 })).provenance.servedFrom).toBe('source');
  });

  it('[GOV-20] walks the horizon through the gate, ended by the deadline through the injected clock', async () => {
    const paged = fetchedOf({
      rows: [horizonRowOf({ endsAt: '2026-08-01' })],
      rejected: 0,
      hasMore: true,
    });
    const { service, sources } = harness({
      script: { ending: [paged] },
      policy: { pullDeadlineMs: 1_500 },
      tickMs: 1_000,
    });
    const horizon = await service.horizon({ ...scope, awardFamily: 'contracts', months: 6 });
    expect(horizon).toMatchObject({
      today: '2026-06-15',
      months: 6,
      capped: true,
      stoppedBy: 'deadline',
      // The deadline fell while the walk was still seeking today's place: no month is complete.
      completeBefore: null,
      rows: [],
    });
    expect(horizon.buckets).toHaveLength(6);
    expect(sources.requests.ending).toHaveLength(1);
    expect(sources.requests.ending[0]).toMatchObject({ family: 'contracts', to: '2026-06-15' });
  });

  it('[GOV-20] a forced refresh asks the source inside the TTL and replaces the snapshot', async () => {
    const point = seriesPointOf({ fiscalYear: 2026, period: 1, total: 5 });
    const { service, operations } = harness({
      script: { series: [fetchedOf([point]), fetchedOf([{ ...point, total: 7 }])] },
    });
    await service.pulse({ ...scope, lookback: 3 });
    const refreshed = await service.pulse({ ...scope, lookback: 3 }, { refresh: true });
    expect(refreshed.provenance.servedFrom).toBe('source');
    expect(
      refreshed.series.find((point) => point.fiscalYear === 2026 && point.period === 1)?.total,
    ).toBe(7);
    expect(operations()).toEqual(['series', 'freshness', 'series']);
    expect((await service.pulse({ ...scope, lookback: 3 })).provenance.servedFrom).toBe('snapshot');
  });

  it('[GOV-25] marks what a late agency has yet to publish from the source’s own data-as-of: the pulse of a scope that counts it, the breakdown whose window reaches past that day, and neither for an agency that publishes on time', async () => {
    const lags = [{ toptierCode: '097', name: 'Department of Defense', days: 90 }];
    const catalog = [
      fetchedOf([
        agencyDirectoryEntryOf(),
        agencyDirectoryEntryOf({ toptierCode: '036', name: 'Department of Veterans Affairs' }),
      ]),
    ];
    const { service } = harness({ script: { catalog }, lags });
    const delay = { agencies: ['Department of Defense'], days: 90, completeThrough: '2026-03-16' };

    // Read on 2026-06-15 with data as of 2026-06-14: March ends after March 16, February does not.
    const pulse = await service.pulse({ ...scope, lookback: 1 });
    expect(pulse.delay).toEqual(delay);
    expect(
      pulse.series
        .filter((point) => point.unpublished)
        .map((point) => `${point.fiscalYear}:${point.period}`),
    ).toEqual(['2026:6', '2026:7', '2026:8', '2026:9']);
    expect((await service.pulse({ ...scope, agency: '097', lookback: 1 })).delay).toEqual(delay);

    const onTime = await service.pulse({ ...scope, agency: '036', lookback: 1 });
    expect(onTime.delay).toBeNull();
    expect(onTime.series.some((point) => point.unpublished)).toBe(false);

    const window = { ...scope, category: 'awarding_agency' as const, from: '2025-10-01' };
    expect((await service.breakdown({ ...window, to: '2026-06-15' })).delay).toEqual(delay);
    expect((await service.breakdown({ ...window, to: '2026-03-16' })).delay).toBeNull();
  });

  it('[GOV-23] joins the horizon’s rows to the open stored notices at read time — a snapshot read recomputes the join, nothing of it is stored, and a row without a NAICS never matches', async () => {
    const notices = new InMemoryOpportunityRepository();
    await notices.upsertMany([opportunityOf()], T0);
    const page = fetchedOf({
      rows: [
        horizonRowOf({ agencyCode: '097.97AS', endsAt: '2026-08-01' }),
        horizonRowOf({ externalId: 'bare', naicsCode: null, endsAt: '2026-08-02' }),
      ],
      rejected: 0,
      hasMore: false,
    });
    const { service, store } = harness({ script: { ending: [page] }, notices });
    const first = await service.horizon({ ...scope, awardFamily: 'contracts', months: 6 });
    expect(first.openNotices).toEqual([
      { externalId: horizonRowOf().externalId, notices: [noticeRefOf(opportunityOf())] },
    ]);
    expect(first.openNoticesCapped).toBe(false);
    for (const row of store.rows.values()) expect(row.payload).not.toHaveProperty('openNotices');

    await notices.upsertMany(
      [opportunityOf({ noticeId: 'n-2', responseDeadlineAt: '2026-09-01T00:00:00.000Z' })],
      T0,
    );
    const second = await service.horizon({ ...scope, awardFamily: 'contracts', months: 6 });
    expect(second.provenance.servedFrom).toBe('snapshot');
    expect(second.openNotices[0]?.notices.map((notice) => notice.noticeId)).toEqual(['n-2', 'n-1']);
  });

  it('[GOV-8] [GOV-20] an unknown agency is a 404, a spent budget a 503, a rate limit a 503, a provider error a 502, and a fiscal year after the current one a 400', async () => {
    const { service } = harness();
    await expect(service.agency('999', { awardFamily: 'both' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.agency('097', { fiscalYear: 2031, awardFamily: 'both' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness({ script: { series: [failure('rate-limited', 429, 'slow down')] } }).service.pulse({
        ...scope,
        lookback: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      harness({ script: { series: [failure('error', 500, 'status 500')] } }).service.pulse({
        ...scope,
        lookback: 1,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await expect(
      harness({ policy: { buckets: { usaspending: { dailyBudget: 0 } } } }).service.agencies(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // The 404 above already resolved the directory, so the directory lens shares that snapshot.
    const directory = await service.agencies();
    expect(directory.entries[0]).toMatchObject({ toptierCode: '097' });
    expect(directory.provenance.servedFrom).toBe('snapshot');
    const outlook = await service.agency('097', { awardFamily: 'both' });
    expect(outlook).toMatchObject({ name: 'Department of Defense', officesFiscalYear: 2026 });
  });
});
