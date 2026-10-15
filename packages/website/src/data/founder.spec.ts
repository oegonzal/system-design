import { describe, expect, it } from 'vitest';

import { FOUNDER } from './founder';

describe('founder', () => {
  it('lists prior employment newest first, by the month each role ended', () => {
    const ends = FOUNDER.experience.map(({ period }) => period.end);

    // YYYY-MM months sort in calendar order as text.
    expect(ends).toEqual([...ends].sort().reverse());
  });
});
