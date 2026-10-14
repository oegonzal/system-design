import {
  isServiceCode,
  NO_FACETS,
  type FacetId,
  type FirmRef,
  type PrimeRow,
  type PrimeSubcontractor,
  type SpendingFacets,
} from '@sysdesign/contracts';

import type { CategoryRow, SubcontractRow } from '../ports';

/**
 * The primes ranking's arithmetic, pure: which rows are one subcontract
 * reported twice, who a row belongs to, and what each prime's rows add up
 * to. A firm is its UEI, and its name as the source spells it only when the
 * source gave no UEI — nothing is matched on a name's likeness.
 */

/** What makes two firms the same firm. */
const firmKey = (firm: FirmRef): string => firm.uei ?? `name:${firm.name}`;

/**
 * What makes two rows the same subcontract: the prime award it sits under,
 * the firm it went to, and its amount. Primes report an earlier subcontract
 * again with a later date, and the source keeps both.
 */
const subcontractKey = (row: SubcontractRow): string =>
  `${row.primeAwardId ?? firmKey(row.prime)}|${firmKey(row.subcontractor)}|${row.amount}`;

/** The rows with each subcontract kept once, in the order given — the first seen wins. */
export function uniqueSubcontracts(rows: readonly SubcontractRow[]): SubcontractRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = subcontractKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface Tally {
  firm: FirmRef;
  subcontracts: number;
  amount: number;
}

const tallied = <K>(tallies: Map<K, Tally>, key: K, firm: FirmRef, amount: number): void => {
  const held = tallies.get(key) ?? { firm, subcontracts: 0, amount: 0 };
  held.subcontracts += 1;
  held.amount += amount;
  tallies.set(key, held);
};

/** Most subcontracts first, then most dollars, then by identity — one order. */
const byWeight = ([aKey, a]: [string, Tally], [bKey, b]: [string, Tally]): number =>
  b.subcontracts - a.subcontracts || b.amount - a.amount || aKey.localeCompare(bKey);

export interface RankLimits {
  primes: number;
  subcontractors: number;
}

export interface PrimesRanking {
  primeCount: number;
  subcontractorCount: number;
  /** The earliest subcontract date among the rows; null when none carries one. */
  reachedBack: string | null;
  primes: PrimeRow[];
}

/**
 * Subcontracts, each already unique, grouped by the prime that reported
 * them and ranked. `obligations` says what a firm holds as a prime in the
 * scope, by UEI; a prime it does not name is left without the figure.
 */
export function rankPrimes(
  rows: readonly SubcontractRow[],
  obligations: ReadonlyMap<string, number>,
  limits: RankLimits,
): PrimesRanking {
  const primes = new Map<string, Tally & { underService: number; subs: Map<string, Tally> }>();
  const everySubcontractor = new Set<string>();
  let reachedBack: string | null = null;
  for (const row of rows) {
    const key = firmKey(row.prime);
    const held = primes.get(key) ?? {
      firm: row.prime,
      subcontracts: 0,
      amount: 0,
      underService: 0,
      subs: new Map<string, Tally>(),
    };
    held.subcontracts += 1;
    held.amount += row.amount;
    if (row.pscCode !== null && isServiceCode(row.pscCode)) held.underService += 1;
    tallied(held.subs, firmKey(row.subcontractor), row.subcontractor, row.amount);
    primes.set(key, held);
    everySubcontractor.add(firmKey(row.subcontractor));
    if (row.date !== null && (reachedBack === null || row.date < reachedBack)) {
      reachedBack = row.date;
    }
  }

  const ranked = [...primes.entries()].sort(byWeight).slice(0, limits.primes);
  return {
    primeCount: primes.size,
    subcontractorCount: everySubcontractor.size,
    reachedBack,
    primes: ranked.map(([, prime]) => ({
      ...prime.firm,
      subcontracts: prime.subcontracts,
      amount: prime.amount,
      subcontractors: prime.subs.size,
      serviceShare: prime.underService / prime.subcontracts,
      obligations: prime.firm.uei === null ? null : (obligations.get(prime.firm.uei) ?? null),
      topSubcontractors: [...prime.subs.entries()]
        .sort(byWeight)
        .slice(0, limits.subcontractors)
        .map(([, sub]): PrimeSubcontractor => ({
          ...sub.firm,
          subcontracts: sub.subcontracts,
          amount: sub.amount,
        })),
    })),
  };
}

/** What each recipient holds as a prime, by the code the source ranks it under — its UEI. */
export const obligationsByUei = (rows: readonly CategoryRow[]): Map<string, number> =>
  new Map(rows.flatMap((row) => (row.code === null ? [] : [[row.code, row.amount] as const])));

/** The facets as a search that cannot honour some of them reads them: those ones unset. */
export const withoutFacets = (
  facets: SpendingFacets,
  unsupported: readonly FacetId[],
): SpendingFacets => {
  const cleared = <K extends FacetId>(held: SpendingFacets, id: K): SpendingFacets => ({
    ...held,
    [id]: NO_FACETS[id],
  });
  return unsupported.reduce(cleared, facets);
};
