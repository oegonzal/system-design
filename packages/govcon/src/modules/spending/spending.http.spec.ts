import {
  awardBodyOf,
  horizonRowOf,
  noticeRefOf,
  opportunityOf,
  type AgencyDirectory,
  type AgencyOutlook,
  type AwardDetail,
  type SourceCall,
  type SpendingBreakdown,
  type SpendingHorizon,
  type SpendingPrimes,
  type SpendingPulse,
  type SpendingReach,
} from '@sysdesign/contracts';
import { GovconSpendingSnapshot } from '@sysdesign/db';

import { fetchedOf } from '../../core/spending/testing';
import {
  bootGovconHttp,
  get,
  json,
  pullTiny,
  resetGovcon,
  truncateGovcon,
  type Envelope,
  type GovconHttp,
  type Issues,
  type Page,
} from '../app/testing';

/** One award's record, at DLA Aviation's sub-tier in the tiny profile's NAICS, with nothing subcontracted. */
const {
  orders: _orders,
  subcontracts: _roster,
  ...AWARD_RECORD
} = awardBodyOf({
  externalId: 'CONT_AWD_SPE4A726P0123_9700_-NONE-_-NONE-',
  naicsCode: '332710',
  agencyCode: '097.97AS',
  subcontractCount: 0,
});

/** One contract at DLA Aviation's sub-tier, in the tiny profile's NAICS, ending inside the window; the IDV page is empty. */
const ENDING = horizonRowOf({ agencyCode: '097.97AS', endsAt: '2026-10-15' });

describe('the spending routes', () => {
  let http: GovconHttp;
  let url: string;

  beforeAll(async () => {
    http = await bootGovconHttp({
      ending: [
        fetchedOf({ rows: [ENDING], rejected: 0, hasMore: false }),
        fetchedOf({ rows: [], rejected: 0, hasMore: false }),
      ],
      subawardCounts: [fetchedOf(2)],
      subawards: [
        fetchedOf({
          rows: [
            {
              prime: { uei: 'JCBMLGPE6Z71', name: 'BOOZ ALLEN HAMILTON INC.' },
              subcontractor: { uei: 'JLW7WAKPEKD4', name: 'TELOS CORPORATION' },
              primeAwardId: 'CONT_AWD_1',
              amount: 250_000,
              date: '2025-09-19',
              pscCode: 'D310',
            },
          ],
          rejected: 0,
          hasMore: false,
        }),
      ],
      awardDetails: [fetchedOf(AWARD_RECORD), fetchedOf(null)],
    });
    url = http.url;
  });

  beforeEach(() => resetGovcon(http));

  afterAll(async () => {
    await truncateGovcon(http.em);
    await http.app.close();
  });

  it('[GOV-8] [GOV-20] [GOV-22] answers the five spending routes from their contracts through the gate — one ledger row per operation, every query string coerced and bounded, an unknown agency 404 — and names the source it served from', async () => {
    const pulse = await get<Envelope<SpendingPulse>>(
      url,
      '/spending/pulse?naics=541511,332710&awardFamily=contracts&lookback=2',
    );
    expect(pulse.data).toMatchObject({
      fiscalYear: 2026,
      scope: { naics: ['332710', '541511'], psc: [], agency: null, awardFamily: 'contracts' },
      projection: null,
      provenance: { source: 'usaspending', servedFrom: 'source', requests: 1, asOf: '2026-06-14' },
    });
    expect(pulse.data.series).toHaveLength(3 * 12);
    expect(pulse.data.series.at(-1)).toMatchObject({ fiscalYear: 2026, period: 12, partial: true });

    const breakdown = await get<Envelope<SpendingBreakdown>>(
      url,
      '/spending/breakdown?category=awarding_agency&naics=332710&from=2025-10-01&to=2026-09-26',
    );
    expect(breakdown.data).toMatchObject({
      category: 'awarding_agency',
      total: 0,
      rows: [],
      truncated: false,
      provenance: { requests: 2 },
    });

    const horizon = await get<Envelope<SpendingHorizon>>(
      url,
      '/spending/horizon?naics=332710&months=6',
    );
    expect(horizon.data).toMatchObject({
      today: '2026-09-26',
      months: 6,
      capped: false,
      openNotices: [],
      openNoticesCapped: false,
    });
    expect(horizon.data.rows.map((row) => row.endsAt)).toEqual(['2026-10-15']);
    expect(horizon.data.buckets.map((bucket) => bucket.month)).toEqual([9, 10, 11, 12, 1, 2]);
    expect(horizon.data.buckets[1]?.contracts.count).toBe(1);

    const agencies = await get<Envelope<AgencyDirectory>>(url, '/spending/agencies');
    expect(agencies.data.entries.map((entry) => entry.toptierCode)).toEqual(['097']);
    const agency = await get<Envelope<AgencyOutlook>>(
      url,
      '/spending/agencies/097?fiscalYear=2026&awardFamily=idvs',
    );
    expect(agency.data).toMatchObject({
      name: 'Department of Defense',
      officesFiscalYear: 2026,
      awardFamily: 'idvs',
      subAgencies: [],
    });

    expect((await fetch(`${url}/spending/agencies/999`)).status).toBe(404);
    expect((await fetch(`${url}/spending/agencies/abc`)).status).toBe(400);
    expect((await fetch(`${url}/spending/horizon?months=0`)).status).toBe(400);
    expect((await fetch(`${url}/spending/pulse?naics=12345678`)).status).toBe(400);
    const oddFamily = await fetch(`${url}/spending/pulse?naics=54151`);
    expect(oddFamily.status).toBe(400);
    expect((await json<Issues>(oddFamily)).issues).toEqual([
      { path: 'naics.0', message: 'a NAICS family is 2, 4 or 6 digits' },
    ]);
    expect(
      (await fetch(`${url}/spending/breakdown?category=nope&from=2026-01-01&to=2026-02-01`)).status,
    ).toBe(400);
    const badWindow = await fetch(
      `${url}/spending/breakdown?category=recipient&from=2026-02-01&to=2026-01-01`,
    );
    expect(badWindow.status).toBe(400);
    expect((await json<Issues>(badWindow)).issues.map((i) => i.path)).toEqual(['to']);

    const calls = await get<Page<SourceCall>>(url, '/source/calls?limit=50');
    const byOperation: Record<string, number> = {};
    for (const call of calls.data)
      byOperation[call.operation] = (byOperation[call.operation] ?? 0) + 1;
    // The horizon's default scope is both families: one page each.
    expect(byOperation).toEqual({
      series: 2,
      breakdown: 1,
      horizon: 2,
      'agency-directory': 3,
      'agency-budget': 1,
      'agency-offices': 1,
      freshness: 4,
    });
    expect(calls.data.every((call) => call.source === 'usaspending')).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('api_key');
    expect((await get<Page<SourceCall>>(url, '/source/calls?operation=series')).meta.total).toBe(2);
    // Nothing warmed behind the suite's back: the sink saw no alert and no digest.
    expect(http.sink.published).toEqual([]);
    expect(http.sink.prompts).toEqual([]);
  });

  it('[GOV-8] [GOV-26] [GOV-27] reads a scope’s facets from the query string in their one spelling, refuses a value outside the vocabulary, keys a scope with a placement as one of contracts whatever family was asked, and answers the reach count through its own operation', async () => {
    const narrowed =
      'naics=541511&recipientSize=small&placement=standalone&amount=15000.01-350000&newOnly=true';
    const pulse = await get<Envelope<SpendingPulse>>(
      url,
      `/spending/pulse?${narrowed}&setAside=SBP,NONE,SBP`,
    );
    expect(pulse.data.scope).toEqual({
      naics: ['541511'],
      psc: [],
      agency: null,
      awardFamily: 'contracts',
      facets: {
        recipient: [],
        recipientSize: 'small',
        placement: 'standalone',
        setAside: ['NONE', 'SBP'],
        amount: { min: 15000.01, max: 350000 },
        newOnly: true,
      },
    });
    // The same scope asked with a family a placement cannot have, its lanes in another order: one snapshot row.
    const pulses = () => http.em.fork().count(GovconSpendingSnapshot, { lens: 'pulse' });
    await get(url, `/spending/pulse?${narrowed}&setAside=NONE,SBP&awardFamily=idvs`);
    expect(await pulses()).toBe(1);
    await get(url, `/spending/pulse?${narrowed}&setAside=NONE`);
    expect(await pulses()).toBe(2);

    for (const bad of [
      'recipientSize=huge',
      'placement=sideways',
      'amount=10-5',
      'amount=lots',
      'newOnly=yes',
      'setAside=not%20a%20code',
    ]) {
      expect((await fetch(`${url}/spending/pulse?${bad}`)).status, bad).toBe(400);
    }
    const badRange = await fetch(`${url}/spending/horizon?amount=-`);
    expect((await json<Issues>(badRange)).issues).toEqual([
      {
        path: 'amount',
        message: 'a range is min-max in dollars, either end open, the floor not above the ceiling',
      },
    ]);

    const reach = await get<Envelope<SpendingReach>>(
      url,
      '/spending/reach?naics=332710&from=2025-09-27&to=2026-09-26&lanes=SBA,NONE',
    );
    expect(reach.data).toMatchObject({
      scope: { naics: ['332710'], awardFamily: 'contracts' },
      from: '2025-09-27',
      to: '2026-09-26',
      lanes: ['NONE', 'SBA'],
      delay: null,
      provenance: { source: 'usaspending', servedFrom: 'source', requests: 12 },
    });
    expect(reach.data.cuts.map((cut) => cut.id)).toEqual(['new', 'lanes', 'standalone', 'small']);
    expect(reach.data.cuts.at(-1)?.facets).toEqual({
      recipient: [],
      recipientSize: 'small',
      placement: 'standalone',
      setAside: ['NONE', 'SBA'],
      amount: null,
      newOnly: true,
    });
    expect(reach.data.bands.map((band) => band.id)).toEqual([
      'micro',
      'simplified',
      'mid',
      'large',
    ]);
    // Reach names no family, and its window is checked like any other.
    const base = `${url}/spending/reach?naics=332710`;
    expect((await fetch(`${base}&awardFamily=idvs&from=2026-01-01&to=2026-02-01`)).status).toBe(
      400,
    );
    expect((await fetch(`${base}&from=2026-02-01&to=2026-01-01`)).status).toBe(400);
    expect((await fetch(base)).status).toBe(400);

    const counted = await get<Page<SourceCall>>(url, '/source/calls?operation=award-count');
    expect(counted.meta.total).toBe(8);
    expect(counted.data[0]?.query).toMatchObject({ awardFamily: 'contracts', from: '2025-09-27' });
  });

  it('[GOV-8] [GOV-29] [GOV-30] ranks a scope’s primes over a window and a size of subcontract, narrows to one firm by UEI, and answers one award by the source’s id with its open notices — a bad band, UEI or id a 400, an unknown award a 404', async () => {
    const primes = await get<Envelope<SpendingPrimes>>(
      url,
      '/spending/primes?naics=332710&from=2024-10-01&to=2025-09-30&band=50000-2000000&recipient=jlw7wakpekd4',
    );
    expect(primes.data).toMatchObject({
      scope: { naics: ['332710'], facets: { recipient: ['JLW7WAKPEKD4'] } },
      band: { min: 50000, max: 2000000 },
      total: 2,
      read: 1,
      duplicates: 0,
      capped: false,
      reachedBack: '2025-09-19',
      primeCount: 1,
      subcontractorCount: 1,
      provenance: { servedFrom: 'source', requests: 3 },
    });
    expect(primes.data.primes[0]).toMatchObject({
      uei: 'JCBMLGPE6Z71',
      subcontracts: 1,
      serviceShare: 1,
      obligations: null,
    });
    const base = `${url}/spending/primes?naics=332710&from=2024-10-01&to=2025-09-30`;
    expect((await fetch(`${base}&band=2000000-50000`)).status).toBe(400);
    const badFirm = await fetch(`${base}&recipient=SHORT`);
    expect(badFirm.status).toBe(400);
    expect((await json<Issues>(badFirm)).issues).toEqual([
      { path: 'recipient.0', message: 'a UEI is twelve letters and digits' },
    ]);
    expect((await fetch(`${url}/spending/primes?naics=332710`)).status).toBe(400);

    await pullTiny(url);
    const award = await get<Envelope<AwardDetail>>(
      url,
      `/spending/awards/${AWARD_RECORD.externalId}`,
    );
    expect(award.data).toMatchObject({
      externalId: AWARD_RECORD.externalId,
      recipient: { uei: 'JCBMLGPE6Z71' },
      endsAt: '2026-12-26',
      endsWithOptionsAt: '2027-12-26',
      competition: { offers: 3 },
      subcontracts: [],
      provenance: { servedFrom: 'source', requests: 1 },
    });
    // The two notices the tiny pull stored at DLA Aviation in 332710, soonest deadline first.
    expect(award.data.openNotices.map((notice) => notice.noticeId)).toEqual(['a', 'b']);
    expect((await fetch(`${url}/spending/awards/CONT_AWD_NOPE`)).status).toBe(404);
    expect((await fetch(`${url}/spending/awards/${'x'.repeat(201)}`)).status).toBe(400);

    const calls = await get<Page<SourceCall>>(url, '/source/calls?limit=50');
    const spent = calls.data
      .filter((call) => call.source === 'usaspending')
      .map((call) => call.operation);
    expect(spent.filter((operation) => operation.startsWith('sub'))).toEqual([
      'subawards',
      'subaward-count',
    ]);
    expect(spent.filter((operation) => operation === 'award-detail')).toHaveLength(2);
    expect(spent).not.toContain('award-subawards');
  });

  it('[GOV-8] [GOV-23] joins the horizon’s expiring awards to the open stored notices sharing NAICS and agency sub-tier at read time, says the bound did not cut, and stores none of it', async () => {
    await pullTiny(url);
    const horizon = await get<Envelope<SpendingHorizon>>(
      url,
      '/spending/horizon?naics=332710&months=6',
    );
    // `a` and `b` are DLA Aviation, NAICS 332710, open past today; `b`'s set-aside is no gate here.
    expect(horizon.data.openNotices).toEqual([
      {
        externalId: ENDING.externalId,
        notices: [
          noticeRefOf(opportunityOf({ noticeId: 'a' })),
          noticeRefOf(opportunityOf({ noticeId: 'b', setAsideCode: '8A' })),
        ],
      },
    ]);
    expect(horizon.data.openNoticesCapped).toBe(false);
    const stored = await http.em.fork().findOne(GovconSpendingSnapshot, { lens: 'horizon' });
    expect(stored?.payload).not.toHaveProperty('openNotices');
    expect(stored?.payload).toMatchObject({
      rows: [expect.objectContaining({ externalId: ENDING.externalId })],
    });
  });
});
