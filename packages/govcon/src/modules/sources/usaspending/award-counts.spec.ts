import { NO_FACETS, type CountRequest } from '@sysdesign/contracts';

import { UsaSpendingAwardCounts } from './award-counts';
import fixture from './fixtures/spending-by-award-count.json';
import { USASPENDING_BASE_URL } from './source';
import { bodyOf, httpOf, okValue } from './testing';

const request: CountRequest = {
  naics: ['541511', '541512', '541519'],
  psc: [],
  agency: null,
  facets: { ...NO_FACETS, newOnly: true },
  awardFamily: 'contracts',
  from: '2024-10-01',
  to: '2025-09-30',
};

describe('the USAspending award counts', () => {
  it('[GOV-11] [GOV-26] posts the scope’s filters alone to spending_by_award_count and reads the contracts and the vehicles it counts, refusing an answer without them', async () => {
    const { http, urls, requests } = httpOf([{ body: fixture }]);
    const { attempts, result } = await new UsaSpendingAwardCounts(http).count(request);
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/search/spending_by_award_count/`);
    expect(requests[0]?.method).toBe('POST');
    expect(bodyOf(requests[0])).toEqual({
      filters: {
        time_period: [
          { start_date: '2024-10-01', end_date: '2025-09-30', date_type: 'new_awards_only' },
        ],
        award_type_codes: ['A', 'B', 'C', 'D'],
        naics_codes: { require: ['541511', '541512', '541519'] },
      },
    });
    expect(attempts).toHaveLength(1);
    // As the source answered on 2026-10-13 for the three codes over fiscal 2025.
    expect(okValue(result)).toEqual({ contracts: 74677, idvs: 0 });

    const odd = httpOf([{ body: { results: { grants: 3 } } }]);
    expect((await new UsaSpendingAwardCounts(odd.http).count(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
  });
});
