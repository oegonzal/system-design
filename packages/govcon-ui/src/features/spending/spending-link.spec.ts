import { describe, expect, it } from 'vitest';

import {
  defaultView,
  parseSpendingView,
  sameView,
  SPENDING_ROUTE,
  spendingHref,
} from './spending-link';

const PROFILE_NAICS = ['332710', '541511'];
const params = (query: string) => new URLSearchParams(query);

describe('the spending view in its address', () => {
  it('[GOVU-12] opens on the profile’s NAICS and the defaults when the address says nothing, and reads what it says — one value per code, an empty code list, the agency, family, tab, category, window and months', () => {
    expect(parseSpendingView(params(''), PROFILE_NAICS)).toEqual(defaultView(PROFILE_NAICS));
    expect(defaultView(PROFILE_NAICS).scope).toEqual({
      naics: '332710, 541511',
      psc: '',
      agency: '',
      awardFamily: 'both',
    });
    expect(
      parseSpendingView(
        params(
          'naics=332710&naics=5415&psc=DA&psc=7030&agency=097&awardFamily=idvs&tab=horizon&category=recipient&window=prior-fy&months=24',
        ),
        PROFILE_NAICS,
      ),
    ).toEqual({
      scope: { naics: '332710, 5415', psc: 'DA, 7030', agency: '097', awardFamily: 'idvs' },
      tab: 'horizon',
      category: 'recipient',
      preset: 'prior-fy',
      months: 24,
    });
    expect(parseSpendingView(params('naics='), PROFILE_NAICS).scope.naics).toBe('');
    expect(parseSpendingView(params(''), []).scope.naics).toBe('');
  });

  it('[GOVU-12] falls back to the default from a value it does not know', () => {
    expect(
      parseSpendingView(
        params('tab=nope&window=yesterday&months=7&awardFamily=all&category=x'),
        PROFILE_NAICS,
      ),
    ).toEqual(defaultView(PROFILE_NAICS));
  });

  it('[GOVU-12] writes only what differs from the default, in one order, round-trips through the address, and tells two spellings of one view from a changed one', () => {
    const base = defaultView(PROFILE_NAICS);
    expect(spendingHref(base, PROFILE_NAICS)).toBe(SPENDING_ROUTE);
    const view = {
      ...base,
      scope: { ...base.scope, naics: '332710', agency: '097' },
      tab: 'horizon' as const,
      months: 24 as const,
    };
    const href = spendingHref(view, PROFILE_NAICS);
    expect(href).toBe('/spending?naics=332710&agency=097&tab=horizon&months=24');
    expect(
      parseSpendingView(new URL(href, 'http://localhost').searchParams, PROFILE_NAICS),
    ).toEqual(view);
    expect(spendingHref({ ...base, scope: { ...base.scope, naics: '' } }, PROFILE_NAICS)).toBe(
      '/spending?naics=',
    );
    expect(
      spendingHref({ ...base, scope: { ...base.scope, naics: '541511,332710' } }, PROFILE_NAICS),
    ).toBe('/spending?naics=541511&naics=332710');
    expect(
      spendingHref(
        { ...base, scope: { ...base.scope, psc: 'da, 7030' }, preset: 'last-12-months' },
        PROFILE_NAICS,
      ),
    ).toBe('/spending?psc=da&psc=7030&window=last-12-months');
    expect(
      sameView(base, { ...base, scope: { ...base.scope, naics: '332710,541511' } }, PROFILE_NAICS),
    ).toBe(true);
    expect(sameView(base, view, PROFILE_NAICS)).toBe(false);
  });
});
