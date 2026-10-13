import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { horizonRowOf } from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import {
  fetchedOf,
  InMemorySnapshotStore,
  scriptedSpendingSources,
  seriesPointOf,
  type SpendingScript,
} from '../../core/spending/testing';
import { failure, InMemorySourceCallLog } from '../../core/testing';
import { SpendingService } from './spending.service';

const T0 = new Date('2026-06-15T12:00:00Z');

/** `tickMs` advances the clock on every read, so a wall-clock deadline can pass inside one call. */
function harness(script: SpendingScript = {}, policy: Partial<BudgetPolicy> = {}, tickMs = 0) {
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
  const service = new SpendingService(
    new InMemorySnapshotStore(),
    sources,
    budget,
    new RequestGate(log, budget, clock),
    clock,
  );
  return {
    service,
    sources,
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
