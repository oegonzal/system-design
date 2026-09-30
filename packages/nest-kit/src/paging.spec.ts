import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { page, pageFields } from './paging';

describe('list paging', () => {
  const query = z.strictObject({ ...pageFields(10, 5) });

  it('coerces the query-string numbers and defaults an absent page', () => {
    expect(query.parse({ limit: '3', offset: '6' })).toEqual({ limit: 3, offset: 6 });
    expect(query.parse({})).toEqual({ limit: 5, offset: 0 });
  });

  it('refuses a page past the ceiling or before the start', () => {
    expect(query.safeParse({ limit: '11' }).success).toBe(false);
    expect(query.safeParse({ limit: '0' }).success).toBe(false);
    expect(query.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('answers a page in the envelope, with where it sits in the whole', () => {
    expect(page(['a', 'b'], 7, { limit: 2, offset: 4 })).toEqual({
      data: ['a', 'b'],
      meta: { total: 7, limit: 2, offset: 4 },
    });
  });
});
