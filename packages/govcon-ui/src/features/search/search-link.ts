import { LEAD_TIERS, SET_ASIDE_CODES, type LeadTier } from '@sysdesign/contracts';

import {
  clampDays,
  clampLimit,
  clampScore,
  DEFAULT_LEAD_FILTERS,
  NOTICE_TYPE_LABELS,
  type LeadFilters,
} from '../leads/lead-filters';
import { choose, type AddressParams } from '../use-address-view';

/**
 * The search page as its address: which side is in front, and what the
 * store is asked for — its filters and its page. The SAM.gov side composes a
 * request to be run or saved, which is a form and not a view, so nothing of
 * it travels here. Only what differs from the page as it opens is written,
 * and every word is checked against its vocabulary.
 */
export const SEARCH_ROUTE = '/search';

export const SEARCH_TABS = [
  { id: 'store', label: 'Store (free)' },
  { id: 'samgov', label: 'SAM.gov (spends requests)' },
] as const;
export type SearchTab = (typeof SEARCH_TABS)[number]['id'];

export interface SearchView {
  tab: SearchTab;
  filters: LeadFilters;
  offset: number;
}

export const DEFAULT_SEARCH_VIEW: SearchView = {
  tab: SEARCH_TABS[0].id,
  filters: DEFAULT_LEAD_FILTERS,
  offset: 0,
};

const NO_TIER = '';

/** A number a URL spells, or nothing when it spells none. */
const numberOf = (raw: string | null): number | null =>
  raw === null || raw.trim() === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);

export function parseSearchView(params: AddressParams): SearchView {
  const base = DEFAULT_SEARCH_VIEW.filters;
  const minScore = numberOf(params.get('minScore'));
  const limit = numberOf(params.get('limit'));
  const days = numberOf(params.get('deadlineWithinDays'));
  const offset = numberOf(params.get('offset'));
  const tier = choose<LeadTier | typeof NO_TIER>([...LEAD_TIERS], params.get('tier'), NO_TIER);
  return {
    tab: choose(
      SEARCH_TABS.map((tab) => tab.id),
      params.get('tab'),
      DEFAULT_SEARCH_VIEW.tab,
    ),
    filters: {
      minScore: minScore === null ? base.minScore : clampScore(minScore),
      tier: tier === NO_TIER ? null : tier,
      naics: params.get('naics') ?? base.naics,
      setAside: choose<string>(SET_ASIDE_CODES, params.get('setAside'), base.setAside),
      noticeTypes: NOTICE_TYPE_LABELS.filter((label) => params.getAll('type').includes(label)),
      agency: params.get('agency') ?? base.agency,
      q: params.get('q') ?? base.q,
      deadlineWithinDays: days === null ? base.deadlineWithinDays : clampDays(days),
      limit: limit === null ? base.limit : clampLimit(limit),
    },
    offset: offset === null ? 0 : Math.max(0, Math.round(offset)),
  };
}

/** The view as its address, in one order; a notice type travels as one value each. */
export function searchHref(view: SearchView): string {
  const base = DEFAULT_SEARCH_VIEW.filters;
  const { filters } = view;
  const search = new URLSearchParams();
  if (view.tab !== DEFAULT_SEARCH_VIEW.tab) search.set('tab', view.tab);
  if (filters.minScore !== base.minScore) search.set('minScore', String(filters.minScore));
  if (filters.tier !== null) search.set('tier', filters.tier);
  if (filters.naics.trim() !== '') search.set('naics', filters.naics.trim());
  if (filters.setAside !== '') search.set('setAside', filters.setAside);
  for (const label of NOTICE_TYPE_LABELS) {
    if (filters.noticeTypes.includes(label)) search.append('type', label);
  }
  if (filters.agency.trim() !== '') search.set('agency', filters.agency.trim());
  if (filters.q.trim() !== '') search.set('q', filters.q.trim());
  if (filters.deadlineWithinDays !== null) {
    search.set('deadlineWithinDays', String(filters.deadlineWithinDays));
  }
  if (filters.limit !== base.limit) search.set('limit', String(filters.limit));
  if (view.offset > 0) search.set('offset', String(view.offset));
  const query = search.toString();
  return query === '' ? SEARCH_ROUTE : `${SEARCH_ROUTE}?${query}`;
}
