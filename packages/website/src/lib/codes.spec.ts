import { describe, expect, it } from 'vitest';

import { formatNaics, formatPsc } from './codes';

describe('codes', () => {
  it('writes a NAICS code with its title and the flags SAM.gov gives it', () => {
    expect(formatNaics({ code: '111110', title: 'Soybean Farming' })).toBe(
      '111110 · Soybean Farming',
    );
    expect(formatNaics({ code: '111110', title: 'Soybean Farming', primary: true })).toBe(
      '111110 · Soybean Farming (primary)',
    );
    expect(
      formatNaics({ code: '111120', title: 'Oilseed Farming', sizeStandardException: true }),
    ).toBe('111120 · Oilseed Farming (size standard exception)');
  });

  it('writes a PSC code with its title', () => {
    expect(formatPsc({ code: 'A000', title: 'Example Services' })).toBe('A000 · Example Services');
  });
});
