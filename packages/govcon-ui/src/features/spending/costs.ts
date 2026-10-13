import type {
  AwardFamilyChoice,
  BreakdownCategory,
  ReachCutId,
  ServedFrom,
} from '@sysdesign/contracts';

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

/** What each reach cut keeps, and why it matters to a firm deciding where to compete. */
export const REACH_CUT_LABEL: Record<ReachCutId, { label: string; note: string }> = {
  new: {
    label: 'New contracts',
    note: 'Begun inside the window: work that was won, not a change to something older.',
  },
  lanes: {
    label: 'In your lanes',
    note: 'Made with no set-aside or under one you may bid.',
  },
  standalone: {
    label: 'No vehicle needed',
    note: 'Placed as contracts of their own, not as orders under a vehicle you must already hold.',
  },
  small: {
    label: 'Won by a small business',
    note: 'What firms your size took of it.',
  },
};

export const LENS_LOADING: Record<SpendingTab, string> = {
  pulse: 'Reading obligations by period',
  where: 'Ranking the scope',
  reach: 'Counting what was within reach',
  horizon: 'Walking the expiring awards',
  agency: 'Reading the agency',
};
