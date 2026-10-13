import type { PublicationLag } from '../../../core/ports';

/**
 * Provider facts about USAspending's data, declared once and carried on every
 * answer that rests on them, so a reader learns them from the answer instead
 * of a client knowing them. Each adapter declares the lists that apply to it.
 */
export const USASPENDING_DISCLOSURES = {
  awards: [
    'USAspending loads award data nightly from the federal procurement system; Department of Defense awards are published 90 days after they are signed.',
  ],
  financials: [
    'Agency budgetary resources and obligations arrive by submission period and are revealed weeks after the period ends.',
  ],
  horizon: [
    'USAspending cannot filter by period of performance: today’s place among a scope’s awards by end date is found by paging, and they are read from the soonest-ending forward within the lookback window, so a wide scope is complete only for its nearest months.',
    'An indefinite-delivery vehicle’s amount is what has been obligated on it so far, often zero — its count is the signal.',
    'An end date here is the award’s current end. Options not yet exercised can carry it further, and the award search does not return the end with options: of eight large awards ending in one week of October 2026, four ran on with options, one by three years.',
  ],
} as const;

/**
 * The agencies whose awards USAspending publishes late, by toptier code.
 * Measured 2026-10-13 against a "data as of" of 2026-10-12: Defense reported
 * $43.3B for June 2026, $12.2B for July, $0.02B for August — the cut falls
 * 90 days back. The Army Corps of Engineers awards under Defense's code, so
 * the one row covers it: as an awarding agency of its own (`096`) it has no
 * contract obligations at all.
 */
export const USASPENDING_PUBLICATION_LAGS: readonly PublicationLag[] = [
  { toptierCode: '097', name: 'Department of Defense', days: 90 },
];
