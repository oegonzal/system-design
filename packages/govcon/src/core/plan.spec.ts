import { DEFAULT_PULL_DAYS, MAX_PULL_DAYS } from '@sysdesign/contracts';

import { planPulls, planSearch, resolveWindow } from './plan';
import { pick, tinyProfile, tinySearches } from './testing';

const NOW = new Date('2026-09-26T23:30:00Z');

describe('the pull plan', () => {
  it('[GOV-14] is one first page per saved search flagged for the pull, in pull order, over the validated window', () => {
    const searches = [
      ...tinySearches(),
      {
        ...pick(tinySearches(), 0),
        id: 's-3',
        name: 'Not pulled',
        includedInPull: false,
        pullOrder: -1,
      },
    ];
    const plan = planPulls(
      tinyProfile(),
      [pick(searches, 1), pick(searches, 2), pick(searches, 0)],
      {
        from: '2026-09-20',
        to: '2026-09-26',
      },
    );
    expect(plan).toEqual([
      {
        name: 'Machine shops',
        query: {
          limit: 100,
          naics: '332710',
          offset: 0,
          postedFrom: '2026-09-20',
          postedTo: '2026-09-26',
        },
      },
      {
        name: 'Computer services',
        query: {
          limit: 100,
          naics: '5415',
          offset: 0,
          postedFrom: '2026-09-20',
          postedTo: '2026-09-26',
        },
      },
    ]);
    expect(
      planSearch(
        tinyProfile(),
        null,
        { naics: '11', status: 'active' },
        { from: '2026-09-20', to: '2026-09-26' },
      ),
    ).toEqual({
      name: null,
      query: {
        limit: 100,
        naics: '11',
        offset: 0,
        postedFrom: '2026-09-20',
        postedTo: '2026-09-26',
        status: 'active',
      },
    });
  });

  it('resolves the last n days in UTC ending today, the default when nothing is asked, or an explicit window', () => {
    expect(resolveWindow({ days: 3 }, NOW)).toEqual({ from: '2026-09-23', to: '2026-09-26' });
    expect(resolveWindow({}, NOW).from).toBe(
      new Date(NOW.getTime() - DEFAULT_PULL_DAYS * 86_400_000).toISOString().slice(0, 10),
    );
    expect(resolveWindow({ from: '2026-09-01', to: '2026-09-02' }, NOW)).toEqual({
      from: '2026-09-01',
      to: '2026-09-02',
    });
  });

  it.each([
    [{ days: 0 }, /integer from 1 to 366/],
    [{ days: 400 }, /integer from 1 to 366/],
    [{ from: '2026-09-01' }, /from and to go together/],
    [{ days: 2, from: '2026-09-01', to: '2026-09-02' }, /alternatives/],
    [{ from: '09/20/2026', to: '2026-09-26' }, /YYYY-MM-DD/],
    [{ from: '2026-09-27', to: '2026-09-26' }, /starts after it ends/],
    [{ from: '2025-01-01', to: '2026-09-26' }, new RegExp(`more than ${MAX_PULL_DAYS} days`)],
    [{ from: '2026-13-01', to: '2026-09-26' }, /real dates/],
  ])('refuses the window %j', (request, pattern) => {
    expect(() => resolveWindow(request, NOW)).toThrow(pattern);
  });
});
