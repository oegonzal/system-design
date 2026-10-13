import { agencyDirectoryEntryOf } from '@sysdesign/contracts';

import { agencyNamed, alignAgencyYears } from './agency';
import { agencyYearOf } from './testing';

describe('aligning an agency', () => {
  it('[GOV-21] aligns agency years newest first with the periods present sorted and deduplicated, keeps a year of nulls with no periods, and finds an agency by toptier code', () => {
    const years = alignAgencyYears([
      agencyYearOf({
        fiscalYear: 2019,
        byPeriod: [3, 6, 9, 12].map((period) => ({ period, obligated: period * 10 })),
      }),
      agencyYearOf({
        fiscalYear: 2027,
        budgetaryResources: null,
        obligated: null,
        outlayed: null,
        byPeriod: [],
      }),
      agencyYearOf({
        fiscalYear: 2026,
        byPeriod: [
          { period: 3, obligated: 120 },
          { period: 2, obligated: 70 },
          { period: 4, obligated: 180 },
          { period: 4, obligated: 181 },
          { period: 13, obligated: 999 },
          { period: 0, obligated: 999 },
        ],
      }),
    ]);
    expect(years.map((year) => year.fiscalYear)).toEqual([2027, 2026, 2019]);
    expect(years[0]).toMatchObject({ budgetaryResources: null, byPeriod: [] });
    expect(years[1]?.byPeriod).toEqual([
      { period: 2, obligated: 70 },
      { period: 3, obligated: 120 },
      { period: 4, obligated: 181 },
    ]);
    expect(years[2]?.byPeriod.map((point) => point.period)).toEqual([3, 6, 9, 12]);

    const entries = [agencyDirectoryEntryOf(), agencyDirectoryEntryOf({ toptierCode: '036' })];
    expect(agencyNamed(entries, '036')?.toptierCode).toBe('036');
    expect(agencyNamed(entries, '999')).toBeNull();
  });
});
