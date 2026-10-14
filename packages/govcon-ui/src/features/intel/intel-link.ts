import { AWARD_SOURCES, type AwardSource } from '@sysdesign/contracts';

import { choose, type AddressParams } from '../use-address-view';
import { EMPTY_AWARD_FILTERS, type AwardFilters } from './award-query-form';

/**
 * The intel page as its address: which side is in front, and what the store
 * of awards is asked for — its filters and its page. A fetch and a lookup
 * are writes, so nothing of their forms travels here. Only what differs
 * from the page as it opens is written, and every word is checked against
 * its vocabulary.
 */
export const INTEL_ROUTE = '/intel';

export const INTEL_TABS = [
  { id: 'awards', label: 'Awards' },
  { id: 'entities', label: 'Entities' },
] as const;
export type IntelTab = (typeof INTEL_TABS)[number]['id'];

export interface IntelView {
  tab: IntelTab;
  filters: AwardFilters;
  offset: number;
}

export const DEFAULT_INTEL_VIEW: IntelView = {
  tab: INTEL_TABS[0].id,
  filters: EMPTY_AWARD_FILTERS,
  offset: 0,
};

const ANY_SOURCE = '';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A day as a date field spells it, or none. */
const dayOf = (raw: string | null): string => (raw !== null && ISO_DAY.test(raw) ? raw : '');

export function parseIntelView(params: AddressParams): IntelView {
  const offset = Number(params.get('offset'));
  return {
    tab: choose(
      INTEL_TABS.map((tab) => tab.id),
      params.get('tab'),
      DEFAULT_INTEL_VIEW.tab,
    ),
    filters: {
      naics: params.get('naics') ?? '',
      psc: params.get('psc') ?? '',
      agency: params.get('agency') ?? '',
      from: dayOf(params.get('from')),
      to: dayOf(params.get('to')),
      source: choose<AwardSource | typeof ANY_SOURCE>(
        [...AWARD_SOURCES],
        params.get('source'),
        ANY_SOURCE,
      ),
    },
    offset: Number.isFinite(offset) && offset > 0 ? Math.round(offset) : 0,
  };
}

/** The view as its address, in one order. */
export function intelHref(view: IntelView): string {
  const search = new URLSearchParams();
  if (view.tab !== DEFAULT_INTEL_VIEW.tab) search.set('tab', view.tab);
  const { filters } = view;
  for (const key of ['naics', 'psc', 'agency', 'from', 'to', 'source'] as const) {
    const value = filters[key].trim();
    if (value !== '') search.set(key, value);
  }
  if (view.offset > 0) search.set('offset', String(view.offset));
  const query = search.toString();
  return query === '' ? INTEL_ROUTE : `${INTEL_ROUTE}?${query}`;
}
