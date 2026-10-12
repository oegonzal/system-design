/**
 * A unit's identity as declared facts, and the one key every process compares
 * them by. The validator that cuts a forbidden taskStart and the domain that
 * keeps the record both call these, so the two can never disagree on whether
 * two values name the same thing.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import {
  UNIT_FACET_NAME_MAX_LENGTH,
  UNIT_FACET_VALUE_MAX_LENGTH,
  UNIT_FACETS_BOUND,
} from './vocab';

/** One declared fact about a unit, as the page names it: `company` → `Acme`. */
export const unitFacetSchema = z.strictObject({
  name: bounded.id(UNIT_FACET_NAME_MAX_LENGTH, {
    min: 1,
    description: "A fact the mission's Unit identity declares, by its name.",
  }),
  value: bounded.id(UNIT_FACET_VALUE_MAX_LENGTH, {
    min: 1,
    description: 'Its value exactly as this page names it.',
  }),
});
export type UnitFacet = z.infer<typeof unitFacetSchema>;

/** The facets a plan carries: every declared fact once; empty when the mission declares none. */
export const unitFacetsSchema = bounded.list(UNIT_FACETS_BOUND, unitFacetSchema, {
  description:
    "Each fact the mission's Unit identity declares, with its value exactly as this page names it; empty when the mission declares none.",
});

/** The facets a record names a unit by: at least one. */
export const unitIdentitySchema = bounded.list(UNIT_FACETS_BOUND, unitFacetSchema, { min: 1 });

/**
 * A value as the key compares it: trimmed, Unicode-normalised, lower-cased
 * under one fixed locale. No collation and no runtime locale, because the key
 * is shared by two processes that must agree on the same two strings.
 */
export const facetKey = (value: string): string =>
  value.trim().normalize('NFKC').toLocaleLowerCase('en-US');

const byName = (a: UnitFacet, b: UnitFacet): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** One key for a set of facets: each `name=key`, sorted by name, one per line. */
export const identityKey = (facets: readonly UnitFacet[]): string =>
  [...facets]
    .sort(byName)
    .map((facet) => `${facet.name}=${facetKey(facet.value)}`)
    .join('\n');

/** Whether a claim's facets match a record's identity: every facet the record names has the same key on the claim. */
export function matchesRecord(
  claim: readonly UnitFacet[],
  identity: readonly UnitFacet[],
): boolean {
  if (identity.length === 0) return false;
  const keys = new Map(claim.map((facet) => [facet.name, facetKey(facet.value)]));
  return identity.every((facet) => keys.get(facet.name) === facetKey(facet.value));
}
