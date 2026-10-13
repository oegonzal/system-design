import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { horizonRowOf, noticeRefOf, opportunityOf } from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
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

/** `tickMs` advances the clock on every read, so a wall-clock deadline can pass inside one call. */
function harness(
  script: SpendingScript = {},
  policy: Partial<BudgetPolicy> = {},
  tickMs = 0,
  notices = new InMemoryOpportunityRepository(),
) {
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
  const sources = scriptedSpendingSources(script);
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

const scope = { naics: ['332710'], psc: [], awardFamily: 'both' as const };

describe('the spending service', () => {
  it('[GOV-20] answers the pulse from the source once, then from the snapshot inside the TTL with no new ledger row, keyed on the fiscal period the clock names', async () => {
    const { service, operations, advance } = harness({
      series: [fetchedOf([seriesPointOf({ fiscalYear: 2026, period: 1, total: 5 })])],
    });
    const first = await service.pulse({ ...scope, lookback: 3 });
    expect(first).toMatchObject({
      fiscalYear: 2026,
      scope: { ...scope, agency: null },
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

  it('[GOV-20] walks the horizon from today through the gate, capped by the page bound and the deadline through the injected clock', async () => {
    const paged = fetchedOf({
      rows: [horizonRowOf({ endsAt: '2026-08-01' })],
      rejected: 0,
      hasMore: true,
    });
    const { service, sources } = harness({ ending: [paged] }, { pullDeadlineMs: 1_500 }, 1_000);
    const horizon = await service.horizon({ ...scope, awardFamily: 'contracts', months: 6 });
    expect(horizon).toMatchObject({
      today: '2026-06-15',
      months: 6,
      capped: true,
      stoppedBy: 'deadline',
      reachedEndsAt: '2026-08-01',
    });
    expect(horizon.buckets).toHaveLength(6);
    expect(sources.requests.ending).toHaveLength(1);
    expect(sources.requests.ending[0]).toMatchObject({ family: 'contracts', to: '2026-06-15' });
  });

  it('[GOV-20] a forced refresh asks the source inside the TTL and replaces the snapshot', async () => {
    const point = seriesPointOf({ fiscalYear: 2026, period: 1, total: 5 });
    const { service, operations } = harness({
      series: [fetchedOf([point]), fetchedOf([{ ...point, total: 7 }])],
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
    const { service, store } = harness({ ending: [page] }, {}, 0, notices);
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
      harness({ series: [failure('rate-limited', 429, 'slow down')] }).service.pulse({
        ...scope,
        lookback: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      harness({ series: [failure('error', 500, 'status 500')] }).service.pulse({
        ...scope,
        lookback: 1,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await expect(
      harness({}, { buckets: { usaspending: { dailyBudget: 0 } } }).service.agencies(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // The 404 above already resolved the directory, so the directory lens shares that snapshot.
    const directory = await service.agencies();
    expect(directory.entries[0]).toMatchObject({ toptierCode: '097' });
    expect(directory.provenance.servedFrom).toBe('snapshot');
    const outlook = await service.agency('097', { awardFamily: 'both' });
    expect(outlook).toMatchObject({ name: 'Department of Defense', officesFiscalYear: 2026 });
  });
});
