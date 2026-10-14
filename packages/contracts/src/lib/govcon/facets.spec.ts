import {
  biddableSetAsides,
  FACET_IDS,
  facetParams,
  facetQueryOf,
  facetsFromParams,
  facetsOfQuery,
  familyUnder,
  formatAmountRange,
  NO_FACETS,
  parseAmountRange,
  sameFacets,
  SPENDING_FACETS,
  withFacet,
  type SpendingFacets,
} from './facets';
import { AWARD_SIZE_BANDS } from './thresholds';

const EVERY: SpendingFacets = {
  recipient: ['JCBMLGPE6Z71', 'SMNWM6HN79X5'],
  recipientSize: 'small',
  placement: 'standalone',
  setAside: ['NONE', 'SBA'],
  amount: { min: 15000.01, max: 350000 },
  newOnly: true,
};

const reader =
  (params: Record<string, string>) =>
  (id: string): string | null =>
    params[id] ?? null;

describe('the spending facets', () => {
  it('[GOV-26] spells each facet one way as a parameter, travels nothing for one not set, and reads the spelling back to the same facets', () => {
    expect(facetParams(NO_FACETS)).toEqual({});
    const params = facetParams(EVERY);
    expect(params).toEqual({
      recipient: 'JCBMLGPE6Z71,SMNWM6HN79X5',
      recipientSize: 'small',
      placement: 'standalone',
      setAside: 'NONE,SBA',
      amount: '15000.01-350000',
      newOnly: 'true',
    });
    expect(facetsFromParams(reader(params))).toEqual(EVERY);
    expect(facetsFromParams(() => null)).toEqual(NO_FACETS);
    // Every facet on the scope has its row in the table, and no row is anything else.
    expect(Object.keys(SPENDING_FACETS).sort()).toEqual(Object.keys(NO_FACETS).sort());
    expect(FACET_IDS).toEqual(Object.keys(SPENDING_FACETS));
  });

  it('[GOV-26] leaves unset whatever an address says that it does not understand, gives a list of codes one spelling, and reads a typed UEI in capitals, dropping what is not one', () => {
    expect(
      facetsFromParams(
        reader({
          recipient: ' smnwm6hn79x5 , not-a-uei, SMNWM6HN79X5',
          recipientSize: 'enormous',
          placement: '',
          setAside: ' SBP , NONE,SBP,,',
          amount: 'lots',
          newOnly: 'yes',
        }),
      ),
    ).toEqual({ ...NO_FACETS, recipient: ['SMNWM6HN79X5'], setAside: ['NONE', 'SBP'] });
    expect(facetsOfQuery({ setAside: ['SBP', 'NONE', 'SBP'] }).setAside).toEqual(['NONE', 'SBP']);
    expect(facetQueryOf(NO_FACETS)).toEqual({});
    expect(facetsOfQuery(facetQueryOf(EVERY))).toEqual(EVERY);
    expect(sameFacets(EVERY, { ...EVERY })).toBe(true);
    expect(sameFacets(EVERY, { ...EVERY, newOnly: false })).toBe(false);
  });

  it('[GOV-26] sets one facet from its spelling and unsets it with null, the others kept', () => {
    const small = withFacet(NO_FACETS, 'recipientSize', 'small');
    expect(small).toEqual({ ...NO_FACETS, recipientSize: 'small' });
    const ranged = withFacet(small, 'amount', '-15000');
    expect(ranged).toEqual({ ...small, amount: { min: null, max: 15000 } });
    expect(withFacet(ranged, 'recipientSize', null)).toEqual({
      ...NO_FACETS,
      amount: { min: null, max: 15000 },
    });
    expect(withFacet(EVERY, 'setAside', 'SBA')).toEqual({ ...EVERY, setAside: ['SBA'] });
  });

  it('[GOV-26] reads a dollar range with either end open and refuses one with no bound, a floor above its ceiling, or anything that is not a range', () => {
    expect(parseAmountRange('15000-350000')).toEqual({ min: 15000, max: 350000 });
    expect(parseAmountRange('900000.01-')).toEqual({ min: 900000.01, max: null });
    expect(parseAmountRange(' -15000 ')).toEqual({ min: null, max: 15000 });
    for (const text of ['-', '', '5', '10-5', 'a-b', '1-2-3', '-5-10']) {
      expect(parseAmountRange(text), text).toBeNull();
    }
    expect(formatAmountRange({ min: null, max: 15000 })).toBe('-15000');
    // The bands the size facet offers leave no dollar in two of them and none outside all of them.
    expect(AWARD_SIZE_BANDS[0].min).toBeNull();
    expect(AWARD_SIZE_BANDS.at(-1)?.max).toBeNull();
    AWARD_SIZE_BANDS.slice(1).forEach((band, index) => {
      expect(band.min).toBeCloseTo((AWARD_SIZE_BANDS[index]?.max ?? 0) + 0.01, 2);
    });
  });

  it('[GOV-26] makes a scope that names a placement a scope of contracts, and reads the lanes a profile may bid from what it prices above nothing', () => {
    expect(familyUnder('both', NO_FACETS)).toBe('both');
    expect(familyUnder('idvs', NO_FACETS)).toBe('idvs');
    expect(familyUnder('both', { ...NO_FACETS, placement: 'order' })).toBe('contracts');
    expect(familyUnder('idvs', { ...NO_FACETS, placement: 'standalone' })).toBe('contracts');

    expect(biddableSetAsides({ byCode: { SBP: 0.8, SBA: 1, '8A': 0 }, unrestricted: 0.5 })).toEqual(
      ['NONE', 'SBA', 'SBP'],
    );
    expect(biddableSetAsides({ byCode: { WOSB: 1 }, unrestricted: 0 })).toEqual(['WOSB']);
    expect(biddableSetAsides({ byCode: {}, unrestricted: 0 })).toEqual([]);
  });
});
