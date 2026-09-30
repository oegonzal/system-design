/**
 * The numbers every govcon layer agrees on: request bounds the HTTP edge
 * validates, the CLI defaults to and the client's forms clamp to. Provider
 * limits are SAM.gov's documented ones; the rest are this package's policy.
 */

/** SAM.gov rejects a posted-date range wider than a year. */
export const MAX_PULL_DAYS = 366;
export const MIN_PULL_DAYS = 1;
export const DEFAULT_PULL_DAYS = 3;
/** SAM.gov's page ceiling. */
export const MAX_PAGE_SIZE = 1000;

/** The most stored notices one ranking reads; the report says when this bound the set. */
export const MAX_CANDIDATES = 5000;
export const DEFAULT_LEAD_LIMIT = 25;
export const MAX_LEAD_LIMIT = 200;

export const DEFAULT_CALL_LIMIT = 50;
export const MAX_CALL_LIMIT = 200;

export const DEFAULT_PIPELINE_LIMIT = 50;
export const MAX_PIPELINE_LIMIT = 200;
/** A bid or a deadline inside this many days is "due soon". */
export const DUE_SOON_DAYS = 7;

export const DEFAULT_AWARD_LIMIT = 50;
export const MAX_AWARD_LIMIT = 500;
/** Pages one award fetch may spend per source — the bound on a single click. */
export const MAX_AWARD_PAGES = 3;
/** SAM.gov's award page ceiling. */
export const AWARD_PAGE_SIZE = 100;

/** Entity Management accepts up to a hundred UEIs per request. */
export const MAX_UEI_BATCH = 100;
