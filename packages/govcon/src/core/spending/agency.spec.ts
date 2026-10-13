import { agencyDirectoryEntryOf } from '@sysdesign/contracts';

import { agencyNamed, alignAgencyYears, topAgencyCodes } from './agency';
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

  it('[GOV-22] names the top agencies through the directory’s own id, skipping a row without one or one the directory lacks, bounded', () => {
    const entries = [
      agencyDirectoryEntryOf(),
      agencyDirectoryEntryOf({ agencyId: 862, toptierCode: '080', abbreviation: 'NASA' }),
    ];
    const rows = [
      { id: '1173', code: 'DOD', name: 'Department of Defense', amount: 5, share: 0.5 },
      { id: null, code: null, name: 'unnamed', amount: 3, share: 0.3 },
      { id: '999999', code: 'X', name: 'nowhere', amount: 1, share: 0.1 },
      { id: '862', code: 'NASA', name: 'NASA', amount: 1, share: 0.1 },
    ];
    expect(topAgencyCodes(rows, entries, 3)).toEqual(['097', '080']);
    expect(topAgencyCodes(rows, entries, 1)).toEqual(['097']);
    expect(topAgencyCodes([], entries, 3)).toEqual([]);
  });
});
