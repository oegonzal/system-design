import type { ApiResponse } from '../envelope';
import type { AmountRange } from './facets';
import type { Provenance, ScopeQuery, SpendingScope } from './spending';

// Primes — who passes work down, read from the subcontracts primes report.

/** A firm as the source names it: its UEI when it gave one. */
export interface FirmRef {
  uei: string | null;
  name: string;
}

export interface PrimeSubcontractor extends FirmRef {
  subcontracts: number;
  amount: number;
}

export interface PrimeRow extends FirmRef {
  /** Subcontracts it reported in the window and band, repeats removed. */
  subcontracts: number;
  amount: number;
  /** Different firms those went to. */
  subcontractors: number;
  /** The share of those placed under a prime award coded as a service, 0..1. */
  serviceShare: number;
  /** Obligated to it as a prime in the scope over the window; null when it is not among the largest recipients read. */
  obligations: number | null;
  /** The firms it reported most often, most first. */
  topSubcontractors: PrimeSubcontractor[];
}

/**
 * The primes of a scope ranked by the subcontracts they reported: the most
 * recent rows in the window and band, read up to a bound, repeats removed,
 * grouped by the prime's own identity. A scope narrowed to one firm reads
 * the other way round, since a subcontract search matches the
 * subcontractor: the primes that reported paying that firm.
 */
export interface SpendingPrimes {
  /** The scope as it was read: a facet a subcontract search cannot honour is unset. */
  scope: SpendingScope;
  /** ISO dates, inclusive, on the subcontract's date. */
  from: string;
  to: string;
  /** Dollars of the subcontract itself; null is any size. */
  band: AmountRange | null;
  /** Subcontracts the source reports for the scope, the window and the band. */
  total: number;
  /** Rows read, most recent first, and how many of them repeated an earlier one. */
  read: number;
  duplicates: number;
  /** The read stopped before the total; `reachedBack` then says how far it got. */
  capped: boolean;
  /** The earliest subcontract date read; null when none was. */
  reachedBack: string | null;
  /** Primes and subcontractors found among the rows read. */
  primeCount: number;
  subcontractorCount: number;
  /** The first `PRIMES_LISTED`, most subcontracts first. */
  primes: PrimeRow[];
  provenance: Provenance;
}

/** The scope, a window of subcontract dates, and the size of subcontract to count. */
export interface SpendingPrimesQuery extends ScopeQuery {
  from: string;
  to: string;
  /** `min-max` in dollars, as a range is spelled; absent counts every size. */
  band?: AmountRange;
}

export type GetSpendingPrimesResponse = ApiResponse<SpendingPrimes>;
