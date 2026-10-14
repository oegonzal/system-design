import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  agencyDirectoryEntryOf,
  awardBodyOf,
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
import { pulseQuerySchema } from './spending-requests';
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

/** A scope as the request schema hands it on: every facet at the schema's own default, so a new facet needs nothing here. */
const { lookback: _lookback, ...scope } = pulseQuerySchema.parse({ naics: '332710' });

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

  it('[GOV-29] [GOV-30] ranks a scope’s primes through the snapshot cache, and answers one award with the open stored notices sharing its NAICS and buyer joined on every read — an id the source does not have a 404', async () => {
    const notices = new InMemoryOpportunityRepository();
    await notices.upsertMany([opportunityOf()], T0);
    const {
      orders: _orders,
      subcontracts: _roster,
      ...record
    } = awardBodyOf({
      naicsCode: '332710',
      agencyCode: '097.97AS',
      subcontractCount: 0,
    });
    const { service, operations, advance } = harness({
      notices,
      script: {
        subawardCounts: [fetchedOf(1)],
        subawards: [
          fetchedOf({
            rows: [
              {
                prime: { uei: 'JCBMLGPE6Z71', name: 'BOOZ ALLEN HAMILTON INC.' },
                subcontractor: { uei: 'JLW7WAKPEKD4', name: 'TELOS CORPORATION' },
                primeAwardId: record.externalId,
                amount: 250_000,
                date: '2025-09-19',
                pscCode: 'D310',
              },
            ],
            rejected: 0,
            hasMore: false,
          }),
        ],
        awardDetails: [fetchedOf(record), fetchedOf(null)],
      },
    });
    const query = {
      ...scope,
      from: '2024-10-01',
      to: '2025-09-30',
      band: { min: 50_000, max: 2_000_000 },
    };
    const primes = await service.primes(query);
    expect(primes).toMatchObject({
      total: 1,
      read: 1,
      capped: false,
      primes: [{ uei: 'JCBMLGPE6Z71', subcontracts: 1, subcontractors: 1 }],
      provenance: { servedFrom: 'source', requests: 3 },
    });
    advance(60_000);
    expect((await service.primes(query)).provenance.servedFrom).toBe('snapshot');
    // Another size of subcontract is another question.
    expect((await service.primes({ ...query, band: undefined })).provenance.servedFrom).toBe(
      'source',
    );

    const before = operations().length;
    const award = await service.award(record.externalId);
    expect(award).toMatchObject({ piid: record.piid, subcontracts: [] });
    expect(award.openNotices).toEqual([noticeRefOf(opportunityOf())]);
    expect(operations().slice(before)).toEqual(['award-detail']);
    // A snapshot read still joins what the store holds now.
    await notices.upsertMany(
      [opportunityOf({ noticeId: 'n-2', responseDeadlineAt: '2026-09-01T00:00:00.000Z' })],
      T0,
    );
    const again = await service.award(record.externalId);
    expect(again.provenance.servedFrom).toBe('snapshot');
    expect(again.openNotices.map((notice) => notice.noticeId)).toEqual(['n-2', 'n-1']);

    await expect(service.award('CONT_AWD_NOPE')).rejects.toBeInstanceOf(NotFoundException);
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

  it('[GOV-34] reads who may hold the work a stored notice is about through the horizon lens — its code, its product service code unless asked not to, its department when the source lists it — keeps the awards at the notice’s own sub-agency, says how many the scope listed, and asks nothing when the notice lacks a fact the join needs', async () => {
    const notices = new InMemoryOpportunityRepository();
    // DLA Aviation (097.97AS), NAICS 332710, PSC 5340; and one whose department the source does not list.
    await notices.upsertMany(
      [
        opportunityOf(),
        opportunityOf({ noticeId: 'elsewhere', agencyCode: '999.97AS.X1' }),
        opportunityOf({ noticeId: 'codeless', naicsCode: null, naicsCodes: [] }),
        opportunityOf({ noticeId: 'department-only', agencyCode: '097' }),
      ],
      T0,
    );
    const page = fetchedOf({
      rows: [
        horizonRowOf({ externalId: 'held', agencyCode: '097.97AS', endsAt: '2026-08-01' }),
        horizonRowOf({ externalId: 'navy', endsAt: '2026-08-02' }),
        horizonRowOf({ externalId: 'held-later', agencyCode: '097.97AS', endsAt: '2027-03-01' }),
      ],
      rejected: 0,
      hasMore: false,
    });
    const { service, sources, operations } = harness({ script: { ending: [page] }, notices });

    const first = await service.incumbents('n-1', { samePsc: true });
    expect(first).toMatchObject({
      noticeId: 'n-1',
      gap: null,
      scope: { naics: ['332710'], psc: ['5340'], agency: '097', awardFamily: 'both' },
      today: '2026-06-15',
      months: 24,
      listed: 3,
      capped: false,
      provenance: { servedFrom: 'source' },
    });
    expect(first.rows.map((row) => row.externalId)).toEqual(['held', 'held-later']);
    // The directory is read once to say whether the department is one the source lists.
    expect(operations().filter((operation) => operation === 'agency-directory')).toHaveLength(1);
    expect(sources.requests.ending[0]).toMatchObject({
      naics: ['332710'],
      psc: ['5340'],
      agency: { toptierCode: '097' },
    });

    // Asked again the same day: the snapshot, and the same answer.
    const before = sources.requests.ending.length;
    expect((await service.incumbents('n-1', { samePsc: true })).provenance?.servedFrom).toBe(
      'snapshot',
    );
    expect(sources.requests.ending).toHaveLength(before);
    // Any product service code is another scope, and another read.
    const wide = await service.incumbents('n-1', { samePsc: false });
    expect(wide.scope).toMatchObject({ psc: [] });
    expect(sources.requests.ending.length).toBeGreaterThan(before);

    // A department the source does not list narrows nothing; the join still holds.
    const elsewhere = await service.incumbents('elsewhere', { samePsc: true });
    expect(elsewhere.scope).toMatchObject({ agency: null, psc: ['5340'] });
    expect(elsewhere.rows.map((row) => row.externalId)).toEqual(['held', 'held-later']);

    const asked = sources.requests.ending.length;
    expect(await service.incumbents('codeless', { samePsc: true })).toEqual({
      noticeId: 'codeless',
      gap: 'naics',
      scope: null,
      today: '2026-06-15',
      months: 24,
      rows: [],
      listed: 0,
      capped: false,
      completeBefore: null,
      provenance: null,
    });
    expect(await service.incumbents('department-only', { samePsc: true })).toMatchObject({
      gap: 'buyer',
      provenance: null,
    });
    expect(sources.requests.ending).toHaveLength(asked);
    await expect(service.incumbents('nope', { samePsc: true })).rejects.toThrow(NotFoundException);
  });
});
