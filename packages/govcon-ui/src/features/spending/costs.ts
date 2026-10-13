import type { AwardFamilyChoice, BreakdownCategory, ServedFrom } from '@sysdesign/contracts';

import type { SpendingTab } from './tabs';

/** What a lens costs and how long it may take, as data — every panel reads its line from here. */
export const SPENDING_COST =
  'Free: USAspending needs no key, and every page read is one ledger row.';

export const FIRST_LOOK_NOTE =
  'The first look at a new scope is built from the source and can take a while; later reads answer from the day’s snapshot.';

export const AWARD_FAMILY_LABEL: Record<AwardFamilyChoice, string> = {
  contracts: 'Contracts',
  idvs: 'IDVs',
  both: 'Contracts and IDVs',
};

export const BREAKDOWN_CATEGORY_LABEL: Record<BreakdownCategory, string> = {
  awarding_agency: 'awarding agency',
  awarding_subagency: 'awarding sub-agency',
  recipient: 'recipient',
  naics: 'NAICS',
  psc: 'PSC',
  state_territory: 'state',
};

export const SERVED_FROM_LABEL: Record<ServedFrom, string> = {
  source: 'fetched now',
  snapshot: 'from the day’s snapshot',
  stale: 'from an older snapshot — the source refused a refresh',
};

export const LENS_LOADING: Record<SpendingTab, string> = {
  pulse: 'Reading obligations by period',
  where: 'Ranking the scope',
  horizon: 'Walking the expiring awards',
  agency: 'Reading the agency',
};
