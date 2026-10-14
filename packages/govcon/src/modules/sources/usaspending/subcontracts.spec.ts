import { NO_FACETS, type SubawardsRequest } from '@sysdesign/contracts';

import fixture from './fixtures/spending-by-award-subawards.json';
import { USASPENDING_BASE_URL } from './source';
import { UsaSpendingSubcontracts } from './subcontracts';
import { bodyOf, httpOf, okValue } from './testing';

const request: SubawardsRequest = {
  naics: ['541511', '541512', '541519'],
  psc: [],
  agency: null,
  facets: { ...NO_FACETS, placement: 'order', setAside: ['NONE'] },
  from: '2024-10-01',
  to: '2025-09-30',
  band: { min: 50_000, max: 2_000_000 },
  limit: 4,
  page: 2,
};
const FILTERS = {
  time_period: [{ start_date: '2024-10-01', end_date: '2025-09-30' }],
  award_type_codes: ['A', 'C'],
  naics_codes: { require: ['541511', '541512', '541519'] },
  set_aside_type_codes: ['NONE'],
  award_amounts: [{ lower_bound: 50_000, upper_bound: 2_000_000 }],
};

describe('the USAspending subcontracts', () => {
  it('[GOV-11] [GOV-29] reads subcontract rows in the award search’s subcontract mode, most recent first by page number, the band as the amount, and declares the facets that mode cannot honour', async () => {
    const { http, urls, requests } = httpOf([{ body: fixture }]);
    const adapter = new UsaSpendingSubcontracts(http);
    expect(adapter.unsupportedFacets).toEqual(['amount', 'newOnly']);
    const { result } = await adapter.page(request);
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/search/spending_by_award/`);
    expect(bodyOf(requests[0])).toMatchObject({
      filters: FILTERS,
      subawards: true,
      sort: 'Sub-Award Date',
      order: 'desc',
      limit: 4,
      page: 2,
    });
    const page = okValue(result);
    // Four records came back, so the page was full and another follows; one had no readable amount.
    expect(page).toMatchObject({ rejected: 1, hasMore: true });
    expect(page.rows[0]).toEqual({
      prime: { uei: 'JCBMLGPE6Z71', name: 'BOOZ ALLEN HAMILTON INC.' },
      subcontractor: { uei: 'JLW7WAKPEKD4', name: 'TELOS CORPORATION' },
      primeAwardId: 'CONT_AWD_89303019FET000003_8900_89303019AET000001_8900',
      amount: 2_000_000,
      date: '2024-11-06',
      pscCode: 'D310',
    });
    expect(page.rows.map((row) => row.prime.uei)).toEqual([
      'JCBMLGPE6Z71',
      'SMNWM6HN79X5',
      'MMLKPW9JLX64',
    ]);

    const short = httpOf([{ body: { results: fixture.results.slice(0, 1) } }]);
    expect(
      okValue((await new UsaSpendingSubcontracts(short.http).page(request)).result),
    ).toMatchObject({ hasMore: false });
  });

  it('[GOV-11] [GOV-29] counts a scope’s subcontracts with the same filters, and refuses an answer without the count', async () => {
    const { http, urls, requests } = httpOf([
      { body: { results: { subcontracts: 7369, subgrants: 0 }, spending_level: 'subawards' } },
    ]);
    const { result } = await new UsaSpendingSubcontracts(http).count(request);
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/search/spending_by_award_count/`);
    expect(bodyOf(requests[0])).toEqual({ filters: FILTERS, subawards: true });
    // As the source answered on 2026-10-13 for the three codes over fiscal 2025, $50K to $2M.
    expect(okValue(result)).toBe(7369);

    const odd = httpOf([{ body: { results: { contracts: 3 } } }]);
    expect((await new UsaSpendingSubcontracts(odd.http).count(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
  });
});
