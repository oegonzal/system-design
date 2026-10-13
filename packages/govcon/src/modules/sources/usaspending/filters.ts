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
 * award types, the NAICS and PSC families required (the provider matches by
 * prefix), and the awarding agency by its toptier name — the API filters
 * agencies by name, which is why a scope's code is resolved first.
 */
export function scopeFilters(input: ScopeFilterInput): Record<string, unknown> {
  return {
    award_type_codes: [...input.codes],
    ...(input.naics.length > 0 ? { naics_codes: { require: [...input.naics] } } : {}),
    ...(input.psc.length > 0 ? { psc_codes: { require: [...input.psc] } } : {}),
    ...(input.agency !== null
      ? { agencies: [{ type: 'awarding', tier: 'toptier', name: input.agency.name }] }
      : {}),
  };
}

/** An action-date window, as the API spells it. */
export const timePeriod = (from: string, to: string): Record<string, unknown> => ({
  time_period: [{ start_date: from, end_date: to }],
});
