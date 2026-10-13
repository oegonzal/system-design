import { publicationDelay } from './publication';

const DEFENSE = { toptierCode: '097', name: 'Department of Defense', days: 90 };
const SLOWER = { toptierCode: '070', name: 'Department of Homeland Security', days: 120 };

describe('what a scope is still missing', () => {
  it('[GOV-25] counts every late agency for a scope of all agencies and only its own for a scope of one, takes the longest lag, and dates the last whole day back from the data-as-of', () => {
    expect(publicationDelay([DEFENSE], null, '2026-10-12')).toEqual({
      agencies: ['Department of Defense'],
      days: 90,
      completeThrough: '2026-07-14',
    });
    expect(publicationDelay([DEFENSE], '097', '2026-10-12')).toEqual({
      agencies: ['Department of Defense'],
      days: 90,
      completeThrough: '2026-07-14',
    });
    expect(publicationDelay([DEFENSE, SLOWER], null, '2026-10-12')).toEqual({
      agencies: ['Department of Defense', 'Department of Homeland Security'],
      days: 120,
      completeThrough: '2026-06-14',
    });
    expect(publicationDelay([DEFENSE, SLOWER], '070', '2026-10-12')).toMatchObject({
      agencies: ['Department of Homeland Security'],
      days: 120,
    });
  });

  it('[GOV-25] is null for an agency that publishes on time, for a source that declares no lag, and for a lag of no days', () => {
    expect(publicationDelay([DEFENSE], '036', '2026-10-12')).toBeNull();
    expect(publicationDelay([], null, '2026-10-12')).toBeNull();
    expect(publicationDelay([{ ...DEFENSE, days: 0 }], null, '2026-10-12')).toBeNull();
  });
});
