import { awardBodyOf, NO_FACETS, type AwardSubcontract } from '@sysdesign/contracts';

import type { AwardRecord, SubcontractPage, SubcontractRow } from '../../ports';
import { failure } from '../../testing';
import { fetchedOf } from '../testing';
import { awardLens } from './award';
import { primesLens } from './primes';
import { harness, SCOPE } from './testing';

const BAH = { uei: 'JCBMLGPE6Z71', name: 'BOOZ ALLEN HAMILTON INC.' };
const GDIT = { uei: 'SMNWM6HN79X5', name: 'GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC.' };
const row = (overrides: Partial<SubcontractRow> = {}): SubcontractRow => ({
  prime: BAH,
  subcontractor: { uei: 'JLW7WAKPEKD4', name: 'TELOS CORPORATION' },
  primeAwardId: 'CONT_AWD_1',
  amount: 250_000,
  date: '2025-09-19',
  pscCode: 'D310',
  ...overrides,
});
const page = (rows: SubcontractRow[], hasMore = false) =>
  fetchedOf<SubcontractPage>({ rows, rejected: 0, hasMore });

const QUERY = {
  ...SCOPE,
  agency: null,
  from: '2023-10-01',
  to: '2025-09-30',
  band: { min: 50_000, max: 2_000_000 },
};

const { orders: _orders, subcontracts: _roster, ...RECORD } = awardBodyOf();

describe('the primes lens', () => {
  it('[GOV-11] [GOV-29] counts the scope’s subcontracts, reads them most recent first a page at a time, removes repeats, ranks the primes, and reads once what each holds itself — every request through the gate under its own operation', async () => {
    const { deps, sources, operations } = harness({
      subawardCounts: [fetchedOf(5)],
      subawards: [
        page(
          [
            row(),
            row({ date: '2025-08-01' }),
            row({ prime: GDIT, primeAwardId: 'CONT_AWD_2', pscCode: '7030' }),
          ],
          true,
        ),
        page([row({ amount: 90_000, date: '2025-04-03' }), row({ prime: GDIT, amount: 60_000 })]),
      ],
      breakdowns: [
        fetchedOf({
          rows: [{ id: 'r-1', code: BAH.uei, name: BAH.name, amount: 3_100_000_000 }],
          hasMore: false,
        }),
      ],
    });
    const primes = await deps.read(primesLens(deps), QUERY);
    if (primes.kind !== 'ok') throw new Error('expected ok');
    expect(primes.body).toMatchObject({
      scope: { ...SCOPE, agency: null },
      from: '2023-10-01',
      to: '2025-09-30',
      band: { min: 50_000, max: 2_000_000 },
      total: 5,
      read: 5,
      duplicates: 1,
      capped: false,
      reachedBack: '2025-04-03',
      primeCount: 2,
      subcontractorCount: 1,
    });
    expect(primes.body.primes).toEqual([
      {
        ...BAH,
        subcontracts: 2,
        amount: 340_000,
        subcontractors: 1,
        serviceShare: 1,
        obligations: 3_100_000_000,
        topSubcontractors: [
          { uei: 'JLW7WAKPEKD4', name: 'TELOS CORPORATION', subcontracts: 2, amount: 340_000 },
        ],
      },
      expect.objectContaining({ ...GDIT, subcontracts: 2, serviceShare: 0.5, obligations: null }),
    ]);
    expect(primes.provenance).toMatchObject({
      requests: 4,
      disclosures: ['subcontract disclosure'],
    });
    expect(operations()).toEqual([
      'subaward-count',
      'subawards',
      'subawards',
      'breakdown',
      'freshness',
    ]);
    expect(sources.requests.subawards.map((request) => request)).toEqual([
      expect.objectContaining({ page: 1, limit: 100, band: QUERY.band, from: '2023-10-01' }),
      expect.objectContaining({ page: 2 }),
    ]);
    expect(sources.requests.breakdowns[0]).toMatchObject({
      category: 'recipient',
      limit: 100,
      from: '2023-10-01',
      to: '2025-09-30',
    });
  });

  it('[GOV-29] unsets the facets a subcontract search cannot honour in the scope it reads and answers, reads nothing when the source holds none, and says when it stopped before the source’s total', async () => {
    const narrowed = {
      ...QUERY,
      facets: {
        ...NO_FACETS,
        recipient: ['JLW7WAKPEKD4'],
        amount: { min: 1, max: 2 },
        newOnly: true,
      },
    };
    const honest = harness(
      { subawardCounts: [fetchedOf(1)], subawards: [page([row()])] },
      { unsupportedFacets: ['amount', 'newOnly'] },
    );
    const answered = await honest.deps.read(primesLens(honest.deps), narrowed);
    if (answered.kind !== 'ok') throw new Error('expected ok');
    // The firm stays — in this search it is the subcontractor — and the two facets that cannot be asked are gone.
    const read = { ...NO_FACETS, recipient: ['JLW7WAKPEKD4'] };
    expect(answered.body.scope.facets).toEqual(read);
    expect(honest.sources.requests.subawardCounts[0]).toMatchObject({ facets: read });
    expect(honest.sources.requests.subawards[0]).toMatchObject({ facets: read });

    const none = harness();
    const empty = await none.deps.read(primesLens(none.deps), QUERY);
    expect(empty).toMatchObject({
      kind: 'ok',
      body: { total: 0, read: 0, capped: false, reachedBack: null, primes: [] },
    });
    expect(none.sources.requests.subawards).toHaveLength(0);

    // Every page is full: the read stops at its page bound and says the source holds more.
    const deep = harness({ subawardCounts: [fetchedOf(16_771)], subawards: [page([row()], true)] });
    const capped = await deep.deps.read(primesLens(deep.deps), QUERY);
    expect(capped).toMatchObject({ kind: 'ok', body: { total: 16_771, read: 30, capped: true } });
    expect(deep.sources.requests.subawards).toHaveLength(30);

    // The wall clock runs out first: what was read is the answer, and it says it is not all.
    const slow = harness(
      { subawardCounts: [fetchedOf(900)], subawards: [page([row()], true)] },
      { tickMs: 25_000 },
    );
    const timed = await slow.deps.read(primesLens(slow.deps), QUERY);
    if (timed.kind !== 'ok') throw new Error('expected ok');
    expect(timed.body.capped).toBe(true);
    expect(slow.sources.requests.subawards.length).toBeLessThan(30);
  });

  it('[GOV-29] answers the source’s refusal when no row was read, and what it read — uncached — when the source cut it short', async () => {
    const refused = harness({ subawardCounts: [failure('rate-limited', 429, 'slow down')] });
    expect(await refused.deps.read(primesLens(refused.deps), QUERY)).toMatchObject({
      kind: 'error',
      outcome: 'rate-limited',
    });
    const blocked = harness({
      subawardCounts: [fetchedOf(300)],
      subawards: [failure('error', 500, 'status 500')],
    });
    expect(await blocked.deps.read(primesLens(blocked.deps), QUERY)).toMatchObject({
      kind: 'error',
      status: 500,
    });

    const partial = harness({
      subawardCounts: [fetchedOf(300)],
      subawards: [page([row()], true), failure('error', 500, 'status 500')],
    });
    const first = await partial.deps.read(primesLens(partial.deps), QUERY);
    expect(first).toMatchObject({
      kind: 'ok',
      body: { read: 1, capped: true },
      provenance: { servedFrom: 'source' },
    });
    // Not kept: the next read asks the source again instead of serving a short answer for a day.
    const again = await partial.deps.read(primesLens(partial.deps), QUERY);
    expect(again).toMatchObject({ kind: 'error', status: 500 });
  });
});

describe('the award lens', () => {
  const ROSTER: AwardSubcontract[] = [
    {
      id: '10747444',
      name: 'CLEARFOCUS TECHNOLOGIES LLC',
      amount: 15_300_000,
      actionDate: '2020-02-25',
      description: null,
    },
  ];

  it('[GOV-11] [GOV-30] reads one award and the largest subcontracts under it through the gate, answers an id the source does not have as missing, and spends one request on an award with none reported', async () => {
    const { deps, sources, operations } = harness({
      awardDetails: [fetchedOf<AwardRecord | null>(RECORD)],
      awardSubawards: [fetchedOf(ROSTER)],
    });
    const award = await deps.read(awardLens(deps), { externalId: 'CONT_AWD_1' });
    expect(award).toMatchObject({
      kind: 'ok',
      body: { ...RECORD, orders: null, subcontracts: ROSTER },
      provenance: { requests: 2, disclosures: ['award disclosure'] },
    });
    expect(operations()).toEqual(['award-detail', 'award-subawards', 'freshness']);
    expect(sources.requests.awardSubawards[0]).toEqual({ externalId: 'CONT_AWD_1', limit: 10 });
    // An order is not a vehicle: nothing is ordered under it, and nothing is asked.
    expect(sources.requests.awardOrders).toHaveLength(0);

    const unknown = harness();
    expect(await unknown.deps.read(awardLens(unknown.deps), { externalId: 'NOPE' })).toEqual({
      kind: 'missing',
      what: 'award',
      id: 'NOPE',
    });
    expect(unknown.sources.requests.awardSubawards).toHaveLength(0);

    const alone = harness({
      awardDetails: [fetchedOf<AwardRecord | null>({ ...RECORD, subcontractCount: 0 })],
    });
    const quiet = await alone.deps.read(awardLens(alone.deps), { externalId: 'CONT_AWD_1' });
    expect(quiet).toMatchObject({
      kind: 'ok',
      body: { subcontracts: [] },
      provenance: { requests: 1 },
    });
    expect(alone.sources.requests.awardSubawards).toHaveLength(0);

    const down = harness({ awardDetails: [failure('error', 502, 'status 502')] });
    expect(await down.deps.read(awardLens(down.deps), { externalId: 'CONT_AWD_1' })).toMatchObject({
      kind: 'error',
      status: 502,
    });
  });

  it('[GOV-11] [GOV-30] reads what was ordered under an award that is itself a vehicle, in one more request under its own operation, and answers nothing when that read is refused', async () => {
    const VEHICLE: AwardRecord = {
      ...RECORD,
      externalId: 'CONT_IDV_1',
      family: 'idvs',
      vehicle: null,
      holders: 'MULTIPLE AWARD',
      obligated: 0,
      subcontractCount: 0,
    };
    const ORDERS = { count: 9, obligated: 47_594_534.33, vehicles: 0 };
    const { deps, sources, operations } = harness({
      awardDetails: [fetchedOf<AwardRecord | null>(VEHICLE)],
      awardOrders: [fetchedOf(ORDERS)],
    });
    const vehicle = await deps.read(awardLens(deps), { externalId: 'CONT_IDV_1' });
    expect(vehicle).toMatchObject({
      kind: 'ok',
      body: { family: 'idvs', holders: 'MULTIPLE AWARD', obligated: 0, orders: ORDERS },
      provenance: { requests: 2 },
    });
    expect(operations()).toEqual(['award-detail', 'award-orders', 'freshness']);
    expect(sources.requests.awardOrders[0]).toEqual({ externalId: 'CONT_IDV_1' });

    const refused = harness({
      awardDetails: [fetchedOf<AwardRecord | null>(VEHICLE)],
      awardOrders: [failure('error', 503, 'status 503')],
    });
    expect(
      await refused.deps.read(awardLens(refused.deps), { externalId: 'CONT_IDV_1' }),
    ).toMatchObject({ kind: 'error', status: 503 });
  });
});
