import type { AgencyRef } from '@sysdesign/contracts';

export interface ScopeFilterInput {
  naics: readonly string[];
  psc: readonly string[];
  agency: AgencyRef | null;
  /** The `award_type_codes` of the family or families asked for. */
  codes: readonly string[];
}

/**
 * The filters every USAspending search shares, as the API spells them: the
 * award types, the NAICS families required, the PSC codes or families, and
 * the awarding agency by its toptier name — the API filters agencies by name,
 * which is why a scope's code is resolved first. Measured 2026-10-13: a flat
 * `psc_codes` list matches by prefix at any length (`DA` is the family,
 * `DA01` the code), while `{ require: [...] }` wants a path through the PSC
 * tree per entry and refuses a bare code with a 422; `naics_codes.require`
 * takes families of 2, 4 or 6 digits and refuses any other length.
 */
export function scopeFilters(input: ScopeFilterInput): Record<string, unknown> {
  return {
    award_type_codes: [...input.codes],
    ...(input.naics.length > 0 ? { naics_codes: { require: [...input.naics] } } : {}),
    ...(input.psc.length > 0 ? { psc_codes: [...input.psc] } : {}),
    ...(input.agency !== null
      ? { agencies: [{ type: 'awarding', tier: 'toptier', name: input.agency.name }] }
      : {}),
  };
}

/** An action-date window, as the API spells it. */
export const timePeriod = (from: string, to: string): Record<string, unknown> => ({
  time_period: [{ start_date: from, end_date: to }],
});
