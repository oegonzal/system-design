import { describe, expect, it } from 'vitest';

import { formatAddress, formatLocality, type PostalAddress } from './address';

/** Made up, so the case tests the format and not the company's address. */
const ADDRESS: PostalAddress = {
  street: '1 Main St',
  locality: 'Springfield',
  region: 'IL',
  regionName: 'Illinois',
  postalCode: '62701-0001',
  country: 'United States',
  countryCode: 'US',
};

describe('address', () => {
  it('writes the whole address on one line, and the city and state as prose names them', () => {
    expect(formatAddress(ADDRESS)).toBe('1 Main St, Springfield, IL 62701-0001, United States');
    expect(formatLocality(ADDRESS)).toBe('Springfield, Illinois');
  });
});
