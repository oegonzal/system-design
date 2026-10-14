import {
  FACET_IDS,
  type FacetId,
  type RecipientSize,
  type ScopeRequest,
  type SpendingFacets,
} from '@sysdesign/contracts';

import { PLACEMENT_TYPE_CODES } from './families';

/** What every award search carries: the scope and the action-date window it is read over. */
export interface AwardFilterInput extends ScopeRequest {
  /** ISO dates, inclusive, on the action date. */
  from: string;
  to: string;
}

/** The `filters` object of a USAspending award search, as far as this package spells it. */
interface AwardFilters {
  time_period: { start_date: string; end_date: string; date_type?: string }[];
  award_type_codes: string[];
  [filter: string]: unknown;
}

const RECIPIENT_TYPE: Record<RecipientSize, string> = {
  small: 'small_business',
  other: 'other_than_small_business',
};

/**
 * What each facet does to the filters once set — one row per facet, so a
 * facet this adapter does not map cannot compile. Measured 2026-10-13 on
 * the count, the series and the category endpoints alike: a set-aside list
 * with `NONE` selects awards made under no set-aside; `award_amounts` bounds
 * are inclusive at both ends; `date_type: new_awards_only` counts an award
 * only when it began inside the window; and `recipient_search_text` given a
 * UEI selects that firm's awards, several of them their union. A placement
 * is a kind of contract, so it names the award types outright, whatever
 * family the request asked for.
 */
const FACET_FILTERS: {
  [K in FacetId]: (value: SpendingFacets[K], filters: AwardFilters) => AwardFilters;
} = {
  recipient: (ueis, filters) =>
    ueis.length === 0 ? filters : { ...filters, recipient_search_text: [...ueis] },
  recipientSize: (size, filters) =>
    size === null ? filters : { ...filters, recipient_type_names: [RECIPIENT_TYPE[size]] },
  placement: (placement, filters) =>
    placement === null
      ? filters
      : { ...filters, award_type_codes: [...PLACEMENT_TYPE_CODES[placement]] },
  setAside: (codes, filters) =>
    codes.length === 0 ? filters : { ...filters, set_aside_type_codes: [...codes] },
  amount: (range, filters) =>
    range === null
      ? filters
      : {
          ...filters,
          award_amounts: [
            {
              ...(range.min === null ? {} : { lower_bound: range.min }),
              ...(range.max === null ? {} : { upper_bound: range.max }),
            },
          ],
        },
  newOnly: (on, filters) =>
    on
      ? {
          ...filters,
          time_period: filters.time_period.map((period) => ({
            ...period,
            date_type: 'new_awards_only',
          })),
        }
      : filters,
};

/**
 * The filters every USAspending award search shares, as the API spells
 * them: the action-date window, the award types, the NAICS families
 * required, the PSC codes or families, the awarding agency by its toptier
 * name — the API filters agencies by name, which is why a scope's code is
 * resolved first — and whatever the scope's facets add. Measured
 * 2026-10-13: a flat `psc_codes` list matches by prefix at any length (`DA`
 * is the family, `DA01` the code), while `{ require: [...] }` wants a path
 * through the PSC tree per entry and refuses a bare code with a 422;
 * `naics_codes.require` takes families of 2, 4 or 6 digits and refuses any
 * other length.
 */
export function awardFilters(
  input: AwardFilterInput,
  typeCodes: readonly string[],
): Record<string, unknown> {
  const base: AwardFilters = {
    time_period: [{ start_date: input.from, end_date: input.to }],
    award_type_codes: [...typeCodes],
    ...(input.naics.length > 0 ? { naics_codes: { require: [...input.naics] } } : {}),
    ...(input.psc.length > 0 ? { psc_codes: [...input.psc] } : {}),
    ...(input.agency !== null
      ? { agencies: [{ type: 'awarding', tier: 'toptier', name: input.agency.name }] }
      : {}),
  };
  const narrowed = <K extends FacetId>(filters: AwardFilters, id: K): AwardFilters =>
    FACET_FILTERS[id](input.facets[id], filters);
  return FACET_IDS.reduce(narrowed, base);
}
