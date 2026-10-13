import { UsaSpendingAgencyCatalog } from './agency-catalog';
import fixture from './fixtures/toptier-agencies.json';
import { USASPENDING_BASE_URL } from './source';
import { httpOf, okValue } from './testing';

describe('the USAspending agency catalog', () => {
  it('[GOV-11] [GOV-20] gets every toptier agency and normalizes its id, code and budget figures, dropping a row without a code', async () => {
    const { http, urls } = httpOf([{ body: fixture }]);
    const { result } = await new UsaSpendingAgencyCatalog(http).agencies();
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/references/toptier_agencies/`);
    const entries = okValue(result);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      agencyId: 1173,
      toptierCode: '097',
      abbreviation: 'DOD',
      name: 'Department of Defense',
      budgetAuthority: 1300000000000,
      obligated: 980000000000,
      outlayed: 870000000000.25,
      activeFiscalYear: 2026,
      activeQuarter: 4,
    });
    expect(entries[1]).toMatchObject({ toptierCode: '036', budgetAuthority: 420000000000 });
    expect(entries[2]).toMatchObject({
      abbreviation: '',
      activeFiscalYear: null,
      activeQuarter: null,
    });
    expect(result).toMatchObject({ recordCount: 4, totalRecords: 4 });
  });
});
