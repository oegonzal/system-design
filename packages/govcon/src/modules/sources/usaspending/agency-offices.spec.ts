import type { AgencyOfficesRequest } from '@sysdesign/contracts';

import { UsaSpendingAgencyOffices } from './agency-offices';
import fixture from './fixtures/sub-agency.json';
import { USASPENDING_BASE_URL } from './source';
import { httpOf, okValue } from './testing';

const request: AgencyOfficesRequest = {
  toptierCode: '097',
  fiscalYear: 2026,
  awardFamily: 'contracts',
  limit: 50,
  page: 1,
};

describe('the USAspending agency offices', () => {
  it('[GOV-11] [GOV-20] gets an agency’s sub-agencies for a year and family, sorted by obligations, and normalizes offices with hasNext', async () => {
    const { http, urls } = httpOf([{ body: fixture }]);
    const { result } = await new UsaSpendingAgencyOffices(http).offices(request);
    const url = new URL(urls[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(
      `${USASPENDING_BASE_URL}/api/v2/agency/097/sub_agency/`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      fiscal_year: '2026',
      award_type_codes: 'A,B,C,D',
      agency_type: 'awarding',
      sort: 'total_obligations',
      order: 'desc',
      limit: '50',
      page: '1',
    });
    const page = okValue(result);
    expect(page.hasMore).toBe(true);
    expect(page.subAgencies).toEqual([
      {
        code: null,
        name: 'Department of the Navy',
        abbreviation: 'USN',
        obligations: 121331542463.71,
        transactions: 119558,
        newAwards: 37352,
        offices: [
          {
            code: 'N00024',
            name: 'NAVSEA HQ',
            obligations: 37460105417.73,
            transactions: 4205,
            newAwards: 999,
          },
          {
            code: 'N00019',
            name: 'NAVAL AIR SYSTEMS COMMAND',
            obligations: 33759202765.48,
            transactions: 3028,
            newAwards: 313,
          },
        ],
      },
      {
        code: null,
        name: 'Defense Logistics Agency',
        abbreviation: null,
        obligations: 48000000000,
        transactions: 1200000,
        newAwards: 640000,
        offices: [],
      },
    ]);
    expect(result).toMatchObject({ recordCount: 3 });
  });
});
