import { NO_FACETS } from '@sysdesign/contracts';

import type { SubcontractRow } from '../ports';
import { obligationsByUei, rankPrimes, uniqueSubcontracts, withoutFacets } from './primes';

const BIG = { uei: 'AAAAAAAAAAA1', name: 'BIG PRIME INC' };
const MID = { uei: 'BBBBBBBBBBB2', name: 'MID PRIME LLC' };
const ROW = { primeAwardId: 'CONT_AWD_1', amount: 100_000, date: '2025-09-01', pscCode: 'DA01' };
const sub = (uei: string | null, name = `SUB ${uei}`) => ({ uei, name });
const row = (overrides: Partial<SubcontractRow>): SubcontractRow => ({
  prime: BIG,
  subcontractor: sub('SSSSSSSSSSS1'),
  ...ROW,
  ...overrides,
});

describe('ranking primes by the subcontracts they report', () => {
  it('[GOV-29] counts the same prime award, subcontractor and amount once whatever its date, and keeps a row that differs in any of the three', () => {
    const rows = [
      row({}),
      row({ date: '2025-06-01' }),
      row({ amount: 100_001 }),
      row({ primeAwardId: 'CONT_AWD_2' }),
      row({ subcontractor: sub('SSSSSSSSSSS2') }),
      // No award id: the prime itself stands in, so two primes' rows never merge.
      row({ primeAwardId: null }),
      row({ primeAwardId: null, prime: MID }),
      row({ primeAwardId: null, date: '2024-01-01' }),
    ];
    const unique = uniqueSubcontracts(rows);
    expect(unique).toHaveLength(6);
    expect(unique[0]?.date).toBe('2025-09-01');
  });

  it('[GOV-29] groups by the prime’s UEI — by its name only where the source gave none — and ranks by subcontracts, then dollars, with each prime’s distinct subcontractors, share under service codes, own obligations and most-reported firms', () => {
    const rows = [
      row({ subcontractor: sub('SSSSSSSSSSS1'), amount: 300_000 }),
      row({ subcontractor: sub('SSSSSSSSSSS1'), amount: 50_000, primeAwardId: 'CONT_AWD_2' }),
      row({ subcontractor: sub('SSSSSSSSSSS2'), amount: 80_000, pscCode: '7030' }),
      row({ subcontractor: sub(null, 'NO UEI CO'), amount: 60_000, pscCode: null }),
      // The same UEI under another spelling of the name is the same prime.
      row({ prime: { ...BIG, name: 'BIG PRIME, INC.' }, subcontractor: sub('SSSSSSSSSSS3') }),
      row({ prime: MID, subcontractor: sub('SSSSSSSSSSS1'), date: '2025-04-03' }),
      row({ prime: MID, subcontractor: sub('SSSSSSSSSSS4'), date: null }),
      // No UEI: the name as the source spells it is all there is.
      row({ prime: { uei: null, name: 'UNREGISTERED PRIME' } }),
      row({ prime: { uei: null, name: 'UNREGISTERED PRIME' }, amount: 5 }),
      row({ prime: { uei: null, name: 'Unregistered Prime' } }),
    ];
    const ranking = rankPrimes(rows, new Map([[BIG.uei, 9_000_000]]), {
      primes: 3,
      subcontractors: 2,
    });
    expect(ranking).toMatchObject({
      primeCount: 4,
      subcontractorCount: 5,
      reachedBack: '2025-04-03',
    });
    expect(ranking.primes.map((prime) => [prime.name, prime.subcontracts])).toEqual([
      ['BIG PRIME INC', 5],
      ['MID PRIME LLC', 2],
      ['UNREGISTERED PRIME', 2],
    ]);
    const [big, mid, unregistered] = ranking.primes;
    expect(big).toMatchObject({
      uei: BIG.uei,
      amount: 590_000,
      subcontractors: 4,
      // Three of its five sit under a service code; one under a product code and one under none do not.
      serviceShare: 0.6,
      obligations: 9_000_000,
    });
    expect(big?.topSubcontractors).toEqual([
      { uei: 'SSSSSSSSSSS1', name: 'SUB SSSSSSSSSSS1', subcontracts: 2, amount: 350_000 },
      { uei: 'SSSSSSSSSSS3', name: 'SUB SSSSSSSSSSS3', subcontracts: 1, amount: 100_000 },
    ]);
    expect(mid).toMatchObject({ obligations: null, subcontractors: 2 });
    expect(unregistered).toMatchObject({ uei: null, obligations: null });

    expect(rankPrimes([], new Map(), { primes: 3, subcontractors: 2 })).toEqual({
      primeCount: 0,
      subcontractorCount: 0,
      reachedBack: null,
      primes: [],
    });
  });

  it('[GOV-29] reads what a firm holds as a prime from the code it is ranked under, and unsets the facets a subcontract search cannot honour', () => {
    expect(
      obligationsByUei([
        { id: 'x', code: BIG.uei, name: BIG.name, amount: 5 },
        { id: null, code: null, name: '(unnamed)', amount: 9 },
      ]),
    ).toEqual(new Map([[BIG.uei, 5]]));

    const facets = {
      ...NO_FACETS,
      recipient: ['SSSSSSSSSSS1'],
      placement: 'order' as const,
      amount: { min: 1, max: 2 },
      newOnly: true,
    };
    expect(withoutFacets(facets, ['amount', 'newOnly'])).toEqual({
      ...NO_FACETS,
      recipient: ['SSSSSSSSSSS1'],
      placement: 'order',
    });
    expect(withoutFacets(facets, [])).toEqual(facets);
  });
});
