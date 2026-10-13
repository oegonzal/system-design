import {
  AWARD_FAMILY_CHOICES,
  BREAKDOWN_CATEGORIES,
  DEFAULT_HORIZON_MONTHS,
  HORIZON_MONTH_CHOICES,
  WINDOW_PRESETS,
  type BreakdownCategory,
  type HorizonMonthChoice,
  type WindowPreset,
} from '@sysdesign/contracts';

import { codesOf } from '../codes';
import type { ScopeDraft } from './scope';
import { SPENDING_TABS, type SpendingTab } from './tabs';

/**
 * The spending view as its address. The URL is the only copy: the scope, the
 * open tab and each lens's own setting are read off it and written back to
 * it, so a reload, a shared link and a return by Back all open the same view.
 * A link that names no scope opens on the profile's NAICS; `naics=` (one
 * empty value) means none; a code list travels as one value per code. Every
 * choice is checked against its declared vocabulary — a URL may say anything.
 */
export const SPENDING_ROUTE = '/spending';

export interface SpendingView {
  scope: ScopeDraft;
  tab: SpendingTab;
  category: BreakdownCategory;
  preset: WindowPreset;
  months: HorizonMonthChoice;
}

/** What a link without parameters opens on: the profile's NAICS, nothing else narrowed, the first tab. */
export const defaultView = (profileNaics: readonly string[]): SpendingView => ({
  scope: { naics: profileNaics.join(', '), psc: '', agency: '', awardFamily: 'both' },
  tab: 'pulse',
  category: 'awarding_agency',
  // A rolling year is a whole picture on any day; the fiscal year to date is thirteen days long on October 13.
  preset: 'last-12-months',
  months: DEFAULT_HORIZON_MONTHS,
});

type Params = Pick<URLSearchParams, 'get' | 'getAll'>;

/** One of the declared choices, or the fallback. */
const choose = <T extends string | number>(
  choices: readonly T[],
  raw: string | null,
  fallback: T,
): T => choices.find((choice) => String(choice) === raw) ?? fallback;

/** A code list parameter: absent is the fallback, one empty value is none, else the codes it names. */
const codesParam = (values: readonly string[], fallback: string): string =>
  values.length === 0 ? fallback : codesOf(values.join(',')).join(', ');

export function parseSpendingView(params: Params, profileNaics: readonly string[]): SpendingView {
  const base = defaultView(profileNaics);
  return {
    scope: {
      naics: codesParam(params.getAll('naics'), base.scope.naics),
      psc: codesParam(params.getAll('psc'), base.scope.psc),
      agency: params.get('agency') ?? base.scope.agency,
      awardFamily: choose(AWARD_FAMILY_CHOICES, params.get('awardFamily'), base.scope.awardFamily),
    },
    tab: choose(
      SPENDING_TABS.map((tab) => tab.id),
      params.get('tab'),
      base.tab,
    ),
    category: choose(BREAKDOWN_CATEGORIES, params.get('category'), base.category),
    preset: choose(
      WINDOW_PRESETS.map((preset) => preset.id),
      params.get('window'),
      base.preset,
    ),
    months: choose(HORIZON_MONTH_CHOICES, params.get('months'), base.months),
  };
}

/** A code list as the address carries it: one value per code, or one empty value for none. */
const appendCodes = (search: URLSearchParams, key: string, typed: string): void => {
  const codes = codesOf(typed);
  if (codes.length === 0) search.append(key, '');
  for (const code of codes) search.append(key, code);
};

const sameCodes = (a: string, b: string): boolean => codesOf(a).join(',') === codesOf(b).join(',');

/** The view as its address: only what differs from the profile's default view is written, in one order. */
export function spendingHref(view: SpendingView, profileNaics: readonly string[]): string {
  const base = defaultView(profileNaics);
  const search = new URLSearchParams();
  if (!sameCodes(view.scope.naics, base.scope.naics))
    appendCodes(search, 'naics', view.scope.naics);
  if (!sameCodes(view.scope.psc, base.scope.psc)) appendCodes(search, 'psc', view.scope.psc);
  if (view.scope.agency !== base.scope.agency) search.set('agency', view.scope.agency);
  if (view.scope.awardFamily !== base.scope.awardFamily) {
    search.set('awardFamily', view.scope.awardFamily);
  }
  if (view.tab !== base.tab) search.set('tab', view.tab);
  if (view.category !== base.category) search.set('category', view.category);
  if (view.preset !== base.preset) search.set('window', view.preset);
  if (view.months !== base.months) search.set('months', String(view.months));
  const query = search.toString();
  return query.length > 0 ? `${SPENDING_ROUTE}?${query}` : SPENDING_ROUTE;
}

/** Two views that spell the same address are the same view. */
export const sameView = (
  a: SpendingView,
  b: SpendingView,
  profileNaics: readonly string[],
): boolean => spendingHref(a, profileNaics) === spendingHref(b, profileNaics);
