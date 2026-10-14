/**
 * A unit's identity as declared facts, and the one key every process compares
 * them by. The validator that cuts a forbidden taskStart and the domain that
 * keeps the record both call these, so the two can never disagree on whether
 * two values name the same thing; and the key a memory recorded for one unit
 * of work is read back by (`unitKeyOf`) is that same identity.
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

/**
 * The most `facetKey` grows a value: keyed, one code point becomes at most
 * eighteen UTF-16 code units (U+FDFA, under NFKC), so a value keys to at most
 * eighteen times its length. Measured 2026-10-14 over every code point.
 */
const FACET_KEY_GROWTH = 18;

/**
 * The longest key `unitKeyOf` composes: every facet a plan may carry, each
 * its name, an `=` and its value keyed at the most keying grows it, with a
 * newline between facets. A unit that carries no facets is keyed by its own
 * id, far shorter. Derived from the facets' own bounds, so the schema never
 * refuses a key the engine composed.
 */
const UNIT_KEY_MAX_LENGTH =
  UNIT_FACETS_BOUND.ceiling *
    (UNIT_FACET_NAME_MAX_LENGTH + 1 + FACET_KEY_GROWTH * UNIT_FACET_VALUE_MAX_LENGTH) +
  UNIT_FACETS_BOUND.ceiling -
  1;

/**
 * A unit of work as its composer names it (`unitKeyOf`): an opaque key that
 * whatever is recorded of one unit carries, and that is compared, never read
 * for what it says.
 */
export const unitKeySchema = bounded.id(UNIT_KEY_MAX_LENGTH, { min: 1 });

/**
 * The key of a unit of work: its identity key when it carries the facets its
 * mission declares — the sameness the advisor, the plan validator and the
 * record already compare units by, so two units of one identity are one unit
 * here too — and its own id when it carries none. What is recorded of one
 * unit is recorded under this key and read back only for a unit of the same
 * key; a mission that needs two units of one identity kept apart declares a
 * finer identity. The key names no mission, as the identity the advisor and
 * the record compare by names none: two missions declaring the same facets
 * read one another's unit memories for units of the same values, so a
 * mission whose units must stay apart from another's declares facets of its
 * own.
 */
export const unitKeyOf = (unit: { id: string; facets: readonly UnitFacet[] }): string =>
  unit.facets.length > 0 ? identityKey(unit.facets) : unit.id;

/** Whether a claim's facets match a record's identity: every facet the record names has the same key on the claim. */
export function matchesRecord(
  claim: readonly UnitFacet[],
  identity: readonly UnitFacet[],
): boolean {
  if (identity.length === 0) return false;
  const keys = new Map(claim.map((facet) => [facet.name, facetKey(facet.value)]));
  return identity.every((facet) => keys.get(facet.name) === facetKey(facet.value));
}
