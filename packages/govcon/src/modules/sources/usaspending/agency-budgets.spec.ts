import { UsaSpendingAgencyBudgets } from './agency-budgets';
import fixture from './fixtures/budgetary-resources.json';
import { USASPENDING_BASE_URL } from './source';
import { httpOf, okValue } from './testing';

describe('the USAspending agency budgets', () => {
  it('[GOV-11] [GOV-20] gets an agency’s budgetary resources by toptier code and normalizes every year as reported, periods included', async () => {
    const { http, urls, requests } = httpOf([{ body: fixture }]);
    const { result } = await new UsaSpendingAgencyBudgets(http).budgets({ toptierCode: '097' });
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/agency/097/budgetary_resources/`);
    expect(requests[0]?.method).toBe('GET');
    const years = okValue(result);
    expect(years.map((year) => year.fiscalYear)).toEqual([2027, 2026, 2019]);
    expect(years[0]).toEqual({
      fiscalYear: 2027,
      budgetaryResources: null,
      obligated: null,
      outlayed: null,
      byPeriod: [],
    });
    expect(years[1]).toMatchObject({
      budgetaryResources: 1300000000000.5,
      obligated: 640000000000,
      outlayed: 560000000000,
    });
    expect(years[1]?.byPeriod.map((point) => point.period)).toEqual([3, 2, 4, 4]);
    expect(years[2]?.byPeriod).toHaveLength(4);
    expect(result).toMatchObject({ recordCount: 4 });

    const odd = httpOf([{ body: { agency_data_by_year: 'nope' } }]);
    expect(
      (await new UsaSpendingAgencyBudgets(odd.http).budgets({ toptierCode: '097' })).result,
    ).toMatchObject({ kind: 'error', outcome: 'invalid-response' });
  });
});
