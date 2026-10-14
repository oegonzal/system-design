import { NO_FACETS, type BreakdownRequest } from '@sysdesign/contracts';

import { toBreakdownBody, UsaSpendingBreakdowns } from './breakdowns';
import fixture from './fixtures/spending-by-category.json';
import { USASPENDING_BASE_URL } from './source';
import { bodyOf, httpOf, okValue } from './testing';

const request: BreakdownRequest = {
  naics: ['332710'],
  psc: [],
  agency: null,
  facets: NO_FACETS,
  awardFamily: 'contracts',
  category: 'awarding_agency',
  from: '2025-10-01',
  to: '2026-06-15',
  limit: 25,
  page: 1,
};

describe('the USAspending breakdowns', () => {
  it('[GOV-11] [GOV-20] posts the category path from the vocabulary and normalizes rows with hasNext', async () => {
    const { http, urls, requests } = httpOf([{ body: fixture }]);
    const { result } = await new UsaSpendingBreakdowns(http).breakdown(request);
    expect(urls[0]).toBe(
      `${USASPENDING_BASE_URL}/api/v2/search/spending_by_category/awarding_agency/`,
    );
    expect(bodyOf(requests[0])).toEqual(toBreakdownBody(request));
    expect(toBreakdownBody(request)).toEqual({
      filters: {
        time_period: [{ start_date: '2025-10-01', end_date: '2026-06-15' }],
        award_type_codes: ['A', 'B', 'C', 'D'],
        naics_codes: { require: ['332710'] },
      },
      limit: 25,
      page: 1,
    });
    const page = okValue(result);
    expect(page.hasMore).toBe(true);
    expect(page.rows).toEqual([
      { id: '1173', code: 'DOD', name: 'Department of Defense', amount: 48444127.94 },
      {
        id: '862',
        code: 'NASA',
        name: 'National Aeronautics and Space Administration',
        amount: 1031288.89,
      },
      { id: '315', code: 'DOS', name: 'Department of State', amount: 523205.26 },
      { id: null, code: null, name: '(unnamed)', amount: 1000 },
      { id: null, code: 'DOI', name: 'DOI', amount: 0 },
    ]);

    // A recipient is ranked under its UEI: the source's own `code` for one is the retired DUNS number.
    const firms = httpOf([
      {
        body: {
          results: [
            {
              recipient_id: 'h-C',
              name: 'CARAHSOFT TECHNOLOGY CORP',
              code: '088365767',
              uei: 'DT8KJHZXVJH5',
              amount: 5,
            },
            { recipient_id: null, name: null, code: null, uei: null, amount: 9 },
          ],
          page_metadata: { hasNext: false },
        },
      },
    ]);
    const ranked = await new UsaSpendingBreakdowns(firms.http).breakdown({
      ...request,
      category: 'recipient',
    });
    expect(okValue(ranked.result).rows).toEqual([
      { id: null, code: 'DT8KJHZXVJH5', name: 'CARAHSOFT TECHNOLOGY CORP', amount: 5 },
      { id: null, code: null, name: '(unnamed)', amount: 9 },
    ]);

    const odd = httpOf([{ body: { results: 'nope' } }]);
    expect((await new UsaSpendingBreakdowns(odd.http).breakdown(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
  });
});
