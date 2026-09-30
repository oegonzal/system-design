import {
  AWARD_SOURCES,
  MAX_AWARD_PAGES,
  MAX_UEI_BATCH,
  type AwardSource,
} from '@sysdesign/contracts';

/** What each budgeted click costs, as data — every button that spends reads its line from here. */
export const AWARD_SOURCE_COST: Record<AwardSource, string> = {
  'sam.gov': `1 request per page for every code, up to ${MAX_AWARD_PAGES} pages each`,
  usaspending: 'free — no key, no budget',
};

export const AWARD_SOURCE_LABEL: Record<AwardSource, string> = {
  'sam.gov': 'SAM.gov Contract Awards',
  usaspending: 'USAspending',
};

/** The sources in vocabulary order, for checkboxes and selects. */
export const AWARD_SOURCE_OPTIONS = AWARD_SOURCES;

/** `n` UEIs cost one request per batch of `MAX_UEI_BATCH`. */
export const lookupCost = (count: number): string => {
  const batches = Math.max(1, Math.ceil(count / MAX_UEI_BATCH));
  return `${batches} request${batches === 1 ? '' : 's'} (1 per ${MAX_UEI_BATCH} UEIs)`;
};
