import {
  horizonRowOf,
  noticeRefOf,
  opportunityOf,
  type AgencyDirectory,
  type AgencyOutlook,
  type SourceCall,
  type SpendingBreakdown,
  type SpendingHorizon,
  type SpendingPulse,
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
