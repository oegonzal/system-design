/**
 * SAM.gov's request vocabularies, kept as documented tables rather than
 * closed types. They name what a query may ask for; nothing in the repo
 * enum-locks inbound data to them — a record whose set-aside or notice type
 * is not listed here is still a record, and a profile prices such values
 * through open maps. The outcomes and tiers at the bottom are the govcon
 * package's own, so they may back a check constraint.
 */

/** `typeOfSetAside` request values SAM.gov documents. */
export const SET_ASIDE_CODES = [
  'SBA',
  'SBP',
  '8A',
  '8AN',
  'HZC',
  'HZS',
  'SDVOSBC',
  'SDVOSBS',
  'WOSB',
  'WOSBSS',
  'EDWOSB',
  'EDWOSBSS',
  'LAS',
  'IEE',
  'ISBEE',
  'BICiv',
  'VSA',
  'VSS',
] as const;
export type SetAsideCode = (typeof SET_ASIDE_CODES)[number];

/** `ptype` request codes and the notice-type label each stands for. */
export const NOTICE_TYPES = {
  u: 'Justification',
  p: 'Presolicitation',
  a: 'Award Notice',
  r: 'Sources Sought',
  s: 'Special Notice',
  o: 'Solicitation',
  g: 'Sale of Surplus Property',
  k: 'Combined Synopsis/Solicitation',
  i: 'Intent to Bundle Requirements (DoD-Funded)',
} as const;
export type NoticeTypeCode = keyof typeof NOTICE_TYPES;

/** How one upstream request ended, as the call log records it. */
export const SOURCE_CALL_OUTCOMES = ['ok', 'error', 'rate-limited', 'invalid-response'] as const;
export type SourceCallOutcome = (typeof SOURCE_CALL_OUTCOMES)[number];

/** A ranked lead's band, cut by the profile's thresholds. */
export const LEAD_TIERS = ['high', 'medium', 'low'] as const;
export type LeadTier = (typeof LEAD_TIERS)[number];

/** What one ledger row was: a search page or a notice description. */
export const SOURCE_OPERATIONS = ['search', 'description'] as const;
export type SourceOperation = (typeof SOURCE_OPERATIONS)[number];

/** How one slice of a pull ended, as the report rows it. */
export const SLICE_OUTCOMES = ['ok', 'cached', 'budget-exhausted', 'error', 'skipped'] as const;
export type SliceOutcome = (typeof SLICE_OUTCOMES)[number];
