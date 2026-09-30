/**
 * Vocabularies. SAM.gov's request tables are documented data, never closed
 * types: they name what a query may ask for, and nothing in the repo
 * enum-locks inbound data to them — a record whose set-aside or notice type
 * is not listed is still a record, priced by a profile's open maps. The
 * govcon package's own words (outcomes, tiers, operations, bid stages, award
 * sources, factor ids) are closed tuples, so a check constraint and a
 * `Record` type can hold them.
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

/** `status` request values: which lifecycle state a search is limited to; unset means every state. */
export const NOTICE_STATUSES = ['active', 'inactive', 'archived', 'cancelled', 'deleted'] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

/** How one upstream request ended, as the call log records it. */
export const SOURCE_CALL_OUTCOMES = ['ok', 'error', 'rate-limited', 'invalid-response'] as const;
export type SourceCallOutcome = (typeof SOURCE_CALL_OUTCOMES)[number];

/**
 * What one ledger row was. Every operation against SAM.gov spends the one
 * daily bucket; only searches answer the cache; `spending` is USAspending,
 * ledgered for the record and priced at nothing.
 */
export const SOURCE_OPERATIONS = [
  'search',
  'description',
  'attachment',
  'awards',
  'spending',
  'entity',
  'exclusions',
] as const;
export type SourceOperation = (typeof SOURCE_OPERATIONS)[number];

/** A ranked lead's band, cut by the profile's thresholds. */
export const LEAD_TIERS = ['high', 'medium', 'low'] as const;
export type LeadTier = (typeof LEAD_TIERS)[number];

/** How one slice of a pull ended, as the report rows it. */
export const SLICE_OUTCOMES = ['ok', 'cached', 'budget-exhausted', 'error', 'skipped'] as const;
export type SliceOutcome = (typeof SLICE_OUTCOMES)[number];

/** Why a pull stopped before its last slice. */
export const PULL_STOPS = ['budget', 'rate-limited', 'deadline'] as const;
export type PullStop = (typeof PULL_STOPS)[number];

/** The bid pipeline, in the order a notice moves through it; the last three are terminal. */
export const BID_STAGES = [
  'watching',
  'qualifying',
  'preparing',
  'submitted',
  'won',
  'lost',
  'passed',
] as const;
export type BidStage = (typeof BID_STAGES)[number];

/** Where an award record came from. */
export const AWARD_SOURCES = ['sam.gov', 'usaspending'] as const;
export type AwardSource = (typeof AWARD_SOURCES)[number];

/** The scorer's factors; a profile prices every one of them. */
export const FACTOR_IDS = [
  'naics',
  'psc',
  'interests',
  'setAside',
  'noticeType',
  'deadline',
  'history',
  'freshness',
] as const;
export type FactorId = (typeof FACTOR_IDS)[number];
