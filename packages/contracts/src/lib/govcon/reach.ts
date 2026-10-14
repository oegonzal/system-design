import type { ApiResponse } from '../envelope';
import type { SpendingFacets } from './facets';
import type { Provenance, PublicationDelay, ScopeQuery, SpendingScope } from './spending';
import type { AwardSizeBandId } from './thresholds';
import type { ReachCutId } from './vocab';

// Reach — how much of a scope's new work a firm could have competed for.

export interface ReachCut {
  id: ReachCutId;
  /** The facets the cut counted under: the scope's own, narrowed this far. Null when they leave the cut nothing to count. */
  facets: SpendingFacets | null;
  awards: number;
  /** Obligated on those awards inside the window. */
  amount: number;
}

export interface ReachBand {
  id: AwardSizeBandId;
  awards: number;
}

/**
 * A scope's new contracts over a window, cut down step by step to the ones a
 * firm with the given lanes could have won as it stands. Contracts only: a
 * vehicle is not work until an order is placed under it.
 */
export interface SpendingReach {
  scope: SpendingScope;
  /** ISO dates, inclusive, on the action date. */
  from: string;
  to: string;
  /** The set-aside lanes the count was taken for. */
  lanes: string[];
  /** In `REACH_CUTS` order; each narrows the one before it. */
  cuts: ReachCut[];
  /** The last cut by award size; the bands add up to it. */
  bands: ReachBand[];
  /** Null unless the window reaches past what an agency the scope counts has published. */
  delay: PublicationDelay | null;
  provenance: Provenance;
}

/** Reach names no award family: it counts contracts. */
export interface SpendingReachQuery extends Omit<ScopeQuery, 'awardFamily'> {
  from: string;
  to: string;
  /** The set-aside lanes to count for; none named counts every lane. */
  lanes?: string[];
}

export type GetSpendingReachResponse = ApiResponse<SpendingReach>;
