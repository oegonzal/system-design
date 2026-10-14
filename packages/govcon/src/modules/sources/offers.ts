/**
 * How the federal procurement system writes "offers were not counted", which
 * every award source relays as it is. Measured 2026-10-13: 466 of 871 stored
 * SAM.gov awards in the 5415 codes carried 999, 464 of them GSA Federal
 * Acquisition Service schedule records, and USAspending's own record of the
 * same schedules carries the same 999. A placeholder is not a count of
 * bidders, so it reads as unknown.
 */
const OFFERS_NOT_COUNTED = 999;

/** A count of offers as a source gave it, or null when it is the placeholder or absent. */
export const offersCounted = (count: number | null): number | null =>
  count === OFFERS_NOT_COUNTED ? null : count;
