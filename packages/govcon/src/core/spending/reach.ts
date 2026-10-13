import {
  AWARD_SIZE_BANDS,
  facetCodesOf,
  REACH_CUTS,
  type AmountRange,
  type AwardSizeBandId,
  type ReachCutId,
  type SpendingFacets,
} from '@sysdesign/contracts';

/**
 * The reach count's arithmetic, pure: how a scope's facets are narrowed cut
 * by cut. Narrowing only ever takes away — a cut that asks for something the
 * facets already rule out leaves nothing to count, which is null here and
 * zero in the answer, never a wider question put to the source.
 */

/** The overlap of two ranges, null when they share no amount. */
function overlap(a: AmountRange, b: AmountRange): AmountRange | null {
  const floors = [a.min, b.min].filter((bound) => bound !== null);
  const ceilings = [a.max, b.max].filter((bound) => bound !== null);
  const min = floors.length > 0 ? Math.max(...floors) : null;
  const max = ceilings.length > 0 ? Math.min(...ceilings) : null;
  return min !== null && max !== null && min > max ? null : { min, max };
}

/** One value both sides accept: either when the other is unset, the one they share, or `impossible`. */
const agree = <T>(held: T | null, asked: T | null | undefined): T | null | 'impossible' => {
  if (asked === null || asked === undefined) return held;
  return held === null || held === asked ? asked : 'impossible';
};

/** `facets` narrowed by `by`; null when nothing can satisfy both. */
export function narrowFacets(
  facets: SpendingFacets,
  by: Partial<SpendingFacets>,
): SpendingFacets | null {
  const recipientSize = agree(facets.recipientSize, by.recipientSize);
  const placement = agree(facets.placement, by.placement);
  if (recipientSize === 'impossible' || placement === 'impossible') return null;

  const asked = facetCodesOf(by.setAside ?? []);
  const setAside =
    asked.length === 0
      ? facets.setAside
      : facets.setAside.length === 0
        ? asked
        : asked.filter((code) => facets.setAside.includes(code));
  if (asked.length > 0 && setAside.length === 0) return null;

  const amount =
    by.amount === null || by.amount === undefined
      ? facets.amount
      : facets.amount === null
        ? by.amount
        : overlap(facets.amount, by.amount);
  if (by.amount !== null && by.amount !== undefined && amount === null) return null;

  return {
    recipientSize,
    placement,
    setAside,
    amount,
    newOnly: facets.newOnly || by.newOnly === true,
  };
}

/** What each cut asks for beyond the one before it; `lanes` are the set-asides the firm may bid, and none named narrows nothing. */
const NARROWING: Record<ReachCutId, (lanes: readonly string[]) => Partial<SpendingFacets>> = {
  new: () => ({ newOnly: true }),
  lanes: (lanes) => ({ setAside: [...lanes] }),
  standalone: () => ({ placement: 'standalone' }),
  small: () => ({ recipientSize: 'small' }),
};

export interface PlannedCut {
  id: ReachCutId;
  /** Null once the scope's own facets leave the cut nothing to count; every later cut is null too. */
  facets: SpendingFacets | null;
}

/** The cuts in order, each the one before it narrowed further. */
export function reachCuts(facets: SpendingFacets, lanes: readonly string[]): PlannedCut[] {
  let held: SpendingFacets | null = facets;
  return REACH_CUTS.map((id) => {
    held = held === null ? null : narrowFacets(held, NARROWING[id](lanes));
    return { id, facets: held };
  });
}

export interface PlannedBand {
  id: AwardSizeBandId;
  facets: SpendingFacets | null;
}

/** One set of facets by award size: each band's overlap with whatever range the facets already hold. */
export const reachBands = (facets: SpendingFacets | null): PlannedBand[] =>
  AWARD_SIZE_BANDS.map((band) => ({
    id: band.id,
    facets:
      facets === null ? null : narrowFacets(facets, { amount: { min: band.min, max: band.max } }),
  }));
