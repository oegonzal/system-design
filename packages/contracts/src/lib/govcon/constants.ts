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

/** Codes of each kind one spending scope may name. */
export const MAX_SCOPE_CODES = 20;
/** Prior fiscal years the pulse shows and projects from. */
export const DEFAULT_PULSE_LOOKBACK_YEARS = 3;
export const MAX_PULSE_LOOKBACK_YEARS = 5;
/** Rows one breakdown answers; the answer says when more exist. */
export const MAX_BREAKDOWN_ROWS = 25;
export const DEFAULT_HORIZON_MONTHS = 12;
export const MAX_HORIZON_MONTHS = 36;
/** The horizons the client offers; each is within `MAX_HORIZON_MONTHS`. */
export const HORIZON_MONTH_CHOICES = [6, 12, 24] as const;
/** The action-date window that bounds a horizon walk's universe, in fiscal years. */
export const HORIZON_LOOKBACK_YEARS = 5;
/** Pages one horizon walk may spend per award family, before the wall-clock deadline. */
export const MAX_HORIZON_PAGES = 30;
/** USAspending's award page ceiling. */
export const HORIZON_PAGE_SIZE = 100;
/** Soonest-ending rows one horizon answer carries. */
export const MAX_HORIZON_ROWS = 200;
/** Sub-agencies one agency outlook answers; the answer says when more exist. */
export const MAX_AGENCY_OFFICES = 50;
/** Open stored notices one horizon read joins to its rows; the answer says when this bound cut. */
export const MAX_RECOMPETE_NOTICES = 500;
/** USAspending's award search begins on 2007-10-01, the first day of FY2008. */
export const FIRST_FISCAL_YEAR = 2008;
