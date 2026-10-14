import { NO_FACETS, type SpendingFacets } from '@sysdesign/contracts';

import { narrowFacets, reachBands, reachCuts } from './reach';

const LANES = ['NONE', 'SBA', 'SBP'];

describe('narrowing a scope’s facets', () => {
  it('[GOV-27] takes what is asked where nothing is held, keeps what both agree on, and is null where they cannot both hold — it never widens', () => {
    expect(narrowFacets(NO_FACETS, { recipientSize: 'small' })).toEqual({
      ...NO_FACETS,
      recipientSize: 'small',
    });
    const small: SpendingFacets = { ...NO_FACETS, recipientSize: 'small' };
    expect(narrowFacets(small, { recipientSize: 'small' })).toEqual(small);
    expect(narrowFacets(small, { recipientSize: 'other' })).toBeNull();
    expect(
      narrowFacets({ ...NO_FACETS, placement: 'order' }, { placement: 'standalone' }),
    ).toBeNull();

    // Lanes meet as their overlap; nothing asked narrows nothing; no overlap is nothing to count.
    const eightA: SpendingFacets = { ...NO_FACETS, setAside: ['8A', 'SBA'] };
    expect(narrowFacets(NO_FACETS, { setAside: LANES })?.setAside).toEqual(LANES);
    expect(narrowFacets(eightA, { setAside: LANES })?.setAside).toEqual(['SBA']);
    expect(narrowFacets(eightA, { setAside: [] })?.setAside).toEqual(['8A', 'SBA']);
    expect(narrowFacets({ ...NO_FACETS, setAside: ['8A'] }, { setAside: LANES })).toBeNull();
    // Firms meet the same way: the ones both name, or nothing to count.
    const firms: SpendingFacets = { ...NO_FACETS, recipient: ['AAAAAAAAAAA1', 'BBBBBBBBBBB2'] };
    expect(narrowFacets(firms, { recipient: ['BBBBBBBBBBB2', 'CCCCCCCCCCC3'] })?.recipient).toEqual(
      ['BBBBBBBBBBB2'],
    );
    expect(narrowFacets(firms, { recipient: ['CCCCCCCCCCC3'] })).toBeNull();
    expect(narrowFacets(firms, {})?.recipient).toEqual(firms.recipient);

    // Ranges meet as their overlap, an open end giving way to a bound.
    const held: SpendingFacets = { ...NO_FACETS, amount: { min: 100_000, max: null } };
    expect(narrowFacets(held, { amount: { min: 15_000.01, max: 350_000 } })?.amount).toEqual({
      min: 100_000,
      max: 350_000,
    });
    expect(narrowFacets(held, { amount: { min: null, max: 15_000 } })).toBeNull();
    expect(narrowFacets(NO_FACETS, { amount: { min: null, max: 15_000 } })?.amount).toEqual({
      min: null,
      max: 15_000,
    });

    expect(narrowFacets(NO_FACETS, { newOnly: true })?.newOnly).toBe(true);
    expect(narrowFacets({ ...NO_FACETS, newOnly: true }, {})?.newOnly).toBe(true);
  });

  it('[GOV-27] plans the cuts in their declared order, each the one before it narrowed further, and every cut after an impossible one is impossible too', () => {
    const cuts = reachCuts(NO_FACETS, LANES);
    expect(cuts.map((cut) => cut.id)).toEqual(['new', 'lanes', 'standalone', 'small']);
    expect(cuts.map((cut) => cut.facets)).toEqual([
      { ...NO_FACETS, newOnly: true },
      { ...NO_FACETS, newOnly: true, setAside: LANES },
      { ...NO_FACETS, newOnly: true, setAside: LANES, placement: 'standalone' },
      {
        ...NO_FACETS,
        newOnly: true,
        setAside: LANES,
        placement: 'standalone',
        recipientSize: 'small',
      },
    ]);

    // No lanes named: that cut narrows nothing.
    expect(reachCuts(NO_FACETS, [])[1]?.facets).toEqual({ ...NO_FACETS, newOnly: true });

    // A scope of orders has no stand-alone contracts: that cut and the one after count nothing.
    const orders = reachCuts({ ...NO_FACETS, placement: 'order' }, LANES);
    expect(orders.map((cut) => cut.facets === null)).toEqual([false, false, true, true]);
  });

  it('[GOV-27] cuts one set of facets by award size as each band’s overlap with the range it already holds', () => {
    const bands = reachBands({ ...NO_FACETS, amount: { min: 100_000, max: 500_000 } });
    expect(bands.map((band) => [band.id, band.facets?.amount ?? null])).toEqual([
      ['micro', null],
      ['simplified', { min: 100_000, max: 350_000 }],
      ['mid', { min: 350_000.01, max: 500_000 }],
      ['large', null],
    ]);
    expect(reachBands(null).every((band) => band.facets === null)).toBe(true);
    expect(reachBands(NO_FACETS).map((band) => band.facets?.amount)).toEqual([
      { min: null, max: 15_000 },
      { min: 15_000.01, max: 350_000 },
      { min: 350_000.01, max: 900_000 },
      { min: 900_000.01, max: null },
    ]);
  });
});
