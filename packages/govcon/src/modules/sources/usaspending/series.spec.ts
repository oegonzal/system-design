import type { SeriesRequest } from '@sysdesign/contracts';

import fixture from './fixtures/spending-over-time.json';
import { toSeriesBody, UsaSpendingSeries } from './series';
import { USASPENDING_BASE_URL } from './source';
import { bodyOf, httpOf, okValue } from './testing';

const request: SeriesRequest = {
  naics: ['332710', '541511'],
  psc: [],
  agency: { toptierCode: '097', name: 'Department of Defense' },
  awardFamily: 'both',
  group: 'month',
  from: '2025-10-01',
  to: '2026-09-30',
};

describe('the USAspending series', () => {
  it('[GOV-11] [GOV-20] posts spending_over_time by month with the scope filters, the family’s codes and the agency’s name, and normalizes fiscal periods', async () => {
    const { http, urls, requests } = httpOf([{ body: fixture }]);
    const { attempts, result } = await new UsaSpendingSeries(http).series(request);
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/search/spending_over_time/`);
    expect(requests[0]?.method).toBe('POST');
    expect(bodyOf(requests[0])).toEqual({
      group: 'month',
      filters: {
        time_period: [{ start_date: '2025-10-01', end_date: '2026-09-30' }],
        award_type_codes: [
          'A',
          'B',
          'C',
          'D',
          'IDV_A',
          'IDV_B',
          'IDV_B_A',
          'IDV_B_B',
          'IDV_B_C',
          'IDV_C',
          'IDV_D',
          'IDV_E',
        ],
        naics_codes: { require: ['332710', '541511'] },
        agencies: [{ type: 'awarding', tier: 'toptier', name: 'Department of Defense' }],
      },
    });
    expect(attempts).toHaveLength(1);
    expect(okValue(result)).toEqual([
      { fiscalYear: 2025, period: 1, contracts: 260000000.66, idvs: 7308069, total: 267308069.66 },
      { fiscalYear: 2025, period: 2, contracts: 120000000, idvs: 0, total: 120000000 },
      { fiscalYear: 2025, period: 3, contracts: -500000, idvs: 0, total: -500000 },
      { fiscalYear: 2026, period: 1, contracts: 36580224.46, idvs: 0, total: 36580224.46 },
    ]);
    expect(result).toMatchObject({ recordCount: 5 });

    expect(
      toSeriesBody({ ...request, agency: null, awardFamily: 'contracts', psc: ['5340'] }),
    ).toEqual({
      group: 'month',
      filters: {
        time_period: [{ start_date: '2025-10-01', end_date: '2026-09-30' }],
        award_type_codes: ['A', 'B', 'C', 'D'],
        naics_codes: { require: ['332710', '541511'] },
        psc_codes: ['5340'],
      },
    });

    const odd = httpOf([{ body: { nope: true } }]);
    expect((await new UsaSpendingSeries(odd.http).series(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
  });
});
