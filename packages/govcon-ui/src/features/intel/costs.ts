import { AWARD_SOURCES, MAX_AWARD_PAGES, type AwardSource } from '@sysdesign/contracts';

/** What each budgeted click costs, as data — every button that spends reads its line from here. */
export const AWARD_SOURCE_COST: Record<AwardSource, string> = {
  'sam.gov': `1 request per page for every code, up to ${MAX_AWARD_PAGES} pages each`,
  usaspending: 'free — no key, no budget',
};

/** What one Fetch click spends, by whether SAM.gov is among the sources. */
export const FETCH_COST = {
  budgeted: `Spends up to ${MAX_AWARD_PAGES} SAM.gov requests (one per page, every code in one request); USAspending is free.`,
  free: 'Spends nothing: USAspending only.',
} as const;

export const AWARD_SOURCE_LABEL: Record<AwardSource, string> = {
  'sam.gov': 'SAM.gov Contract Awards',
  usaspending: 'USAspending',
};

/** The sources in vocabulary order, for checkboxes and selects. */
export const AWARD_SOURCE_OPTIONS = AWARD_SOURCES;
