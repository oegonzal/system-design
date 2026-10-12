import { describe, expect, it } from 'vitest';

import {
  facetKey,
  identityKey,
  matchesRecord,
  unitFacetSchema,
  unitFacetsSchema,
} from './identity';
import { UNIT_FACET_VALUE_MAX_LENGTH } from './vocab';

describe('a unit’s identity as declared facets', () => {
  it('[BRW-13] keys a value by trimming, Unicode-normalising and lower-casing under one fixed locale — never by collation or the runtime’s locale', () => {
    expect(facetKey('  Acme ')).toBe('acme');
    expect(facetKey('ACME')).toBe(facetKey('acme'));
    // Composed and decomposed accents are one key; a different letter is not.
    expect(facetKey('Café')).toBe(facetKey('Café'));
    expect(facetKey('Acme Corp')).not.toBe(facetKey('Acme'));
    // The Turkish dotless i would differ under a runtime locale; the fixed one keeps I → i.
    expect(facetKey('I')).toBe('i');
  });

  it('[BRW-13] keys an identity by every facet, sorted by name, so the same facts in another order are one key', () => {
    const key = identityKey([
      { name: 'role', value: 'Staff Engineer' },
      { name: 'company', value: 'Acme' },
    ]);
    expect(key).toBe('company=acme\nrole=staff engineer');
    expect(
      identityKey([
        { name: 'company', value: ' ACME' },
        { name: 'role', value: 'staff engineer' },
      ]),
    ).toBe(key);
  });

  it('[BRW-13] a record matches a claim when every facet the record names has the same key on the claim — a facet the claim lacks, or an empty identity, never matches', () => {
    const claim = [
      { name: 'company', value: 'Acme' },
      { name: 'role', value: 'Staff Engineer' },
    ];
    expect(matchesRecord(claim, [{ name: 'company', value: 'acme' }])).toBe(true);
    expect(matchesRecord(claim, [{ name: 'company', value: 'Acme Corp' }])).toBe(false);
    expect(
      matchesRecord(claim, [
        { name: 'company', value: 'Acme' },
        { name: 'role', value: 'Senior Engineer' },
      ]),
    ).toBe(false);
    expect(matchesRecord(claim, [{ name: 'notice', value: '42' }])).toBe(false);
    expect(matchesRecord(claim, [])).toBe(false);
  });

  it('[BRW-13] a facet is an exact id: an overlong or empty value is a structural fault, never kept, and a plan may carry none', () => {
    expect(unitFacetSchema.safeParse({ name: 'company', value: 'Acme' }).success).toBe(true);
    expect(unitFacetSchema.safeParse({ name: 'company', value: '' }).success).toBe(false);
    expect(
      unitFacetSchema.safeParse({
        name: 'company',
        value: 'x'.repeat(UNIT_FACET_VALUE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(unitFacetsSchema.safeParse([]).success).toBe(true);
  });
});
