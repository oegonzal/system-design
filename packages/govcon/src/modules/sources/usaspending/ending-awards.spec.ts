import { NO_FACETS, type HorizonRequest } from '@sysdesign/contracts';

import { normalizeEndingAward, toEndingBody, UsaSpendingEndingAwards } from './ending-awards';
import contracts from './fixtures/spending-by-award-ending-contracts.json';
import idvs from './fixtures/spending-by-award-ending-idvs.json';
import { USASPENDING_BASE_URL } from './source';
import { bodyOf, httpOf, okValue } from './testing';

const request: HorizonRequest = {
  naics: ['332710'],
  psc: [],
  agency: null,
  facets: NO_FACETS,
  family: 'contracts',
  from: '2021-10-01',
  to: '2026-06-15',
  limit: 100,
  page: 1,
};

describe('the USAspending ending awards', () => {
  it("[GOV-11] [GOV-20] asks for End Date on contracts and Last Date to Order on IDVs, sorted newest-ending, pages by number without the source's cursor, reads a full page as more to come whatever the source's hasNext says, and rejects a row without an end date", async () => {
    const { http, urls, requests } = httpOf([{ body: contracts }]);
    const { result } = await new UsaSpendingEndingAwards(http).page(request);
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/search/spending_by_award/`);
    const body = bodyOf(requests[0]) as Record<string, unknown>;
    expect(body).toMatchObject({
      filters: {
        time_period: [{ start_date: '2021-10-01', end_date: '2026-06-15' }],
        award_type_codes: ['A', 'B', 'C', 'D'],
        naics_codes: { require: ['332710'] },
      },
      sort: 'End Date',
      order: 'desc',
      limit: 100,
      page: 1,
    });
    expect(body['fields']).toContain('End Date');
    expect(body['fields']).not.toContain('Last Date to Order');
    expect(body).not.toHaveProperty('last_record_unique_id');

    const page = okValue(result);
    expect(page.rejected).toBe(1);
    // Three records against a limit of a hundred: the last page.
    expect(page.hasMore).toBe(false);
    const full = httpOf([{ body: { ...contracts, page_metadata: { hasNext: false } } }]);
    expect(
      okValue((await new UsaSpendingEndingAwards(full.http).page({ ...request, limit: 3 })).result)
        .hasMore,
    ).toBe(true);
    expect(page.rows[0]).toEqual({
      externalId: 'CONT_AWD_N6660426P0205_9700_-NONE-_-NONE-',
      piid: 'N6660426P0205',
      family: 'contracts',
      typeDescription: 'PURCHASE ORDER',
      recipientName: 'VIRGINIA HIGHLANDS MACHINE INC.',
      recipientUei: 'DMDXQNBUKXV5',
      amount: 266963.4,
      endsAt: '2030-11-30',
      agencyPath: 'Department of Defense.Department of the Navy',
      agencyCode: '097.1700',
      naicsCode: '332710',
      pscCode: '5340',
      description:
        'HOUSING AND END-PLATES COMPONENTS REQUIRED FOR CRITICAL UNDERWATER SONAR CAPABILITIES.',
    });
    expect(page.rows[1]).toMatchObject({
      piid: 'SPE4A726P0123',
      recipientUei: null,
      amount: 52000,
      endsAt: '2026-07-20',
      agencyCode: '097.97AS',
      pscCode: null,
      description: null,
    });

    const paged = toEndingBody({
      ...request,
      family: 'idvs',
      page: 2,
    }) as Record<string, unknown>;
    expect(paged).toMatchObject({ sort: 'Last Date to Order', page: 2 });
    expect(paged).not.toHaveProperty('last_record_unique_id');
    expect(paged).not.toHaveProperty('last_record_sort_value');
    expect(paged['fields']).toContain('Last Date to Order');
    expect((paged['filters'] as Record<string, unknown>)['award_type_codes']).toEqual([
      'IDV_A',
      'IDV_B',
      'IDV_B_A',
      'IDV_B_B',
      'IDV_B_C',
      'IDV_C',
      'IDV_D',
      'IDV_E',
    ]);

    const idvPage = okValue(
      (
        await new UsaSpendingEndingAwards(httpOf([{ body: idvs }]).http).page({
          ...request,
          family: 'idvs',
        })
      ).result,
    );
    expect(idvPage.hasMore).toBe(false);
    // A buyer's own dots never split its name: the path reads back whole.
    expect(idvPage.rows[0]?.agencyPath).toBe('Department of Homeland Security.US Coast Guard');
    expect(idvPage.rows[0]).toMatchObject({
      externalId: 'CONT_IDV_70Z08026D16007B00_7008',
      family: 'idvs',
      amount: 0,
      endsAt: '2031-09-14',
      agencyCode: '070.7008',
      typeDescription: 'INDEFINITE DELIVERY / INDEFINITE QUANTITY',
    });
    expect(
      normalizeEndingAward({ generated_internal_id: 'x', 'End Date': 'soon' }, 'contracts'),
    ).toEqual({
      ok: false,
      reason: 'End Date: missing or unreadable',
    });

    const odd = httpOf([{ body: { results: {} } }]);
    expect((await new UsaSpendingEndingAwards(odd.http).page(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
  });
});
