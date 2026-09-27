import { canonicalQuery, descriptionKey, nextPage, queryKey, type OpportunityQuery } from './query';

const base: OpportunityQuery = {
  postedFrom: '2026-09-20',
  postedTo: '2026-09-26',
  limit: 1000,
  offset: 0,
  naics: '332710',
};

describe('the query key', () => {
  it('[GOV-7] is a function of the canonical query alone — the key never has a field to leak into', () => {
    const reordered = {
      naics: '332710',
      offset: 0,
      limit: 1000,
      postedTo: '2026-09-26',
      postedFrom: '2026-09-20',
    };
    const withUndefined = { ...base, psc: undefined };
    expect(queryKey('sam.gov', reordered)).toBe(queryKey('sam.gov', base));
    expect(queryKey('sam.gov', withUndefined)).toBe(queryKey('sam.gov', base));
    expect(queryKey('sam.gov', base)).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(canonicalQuery(withUndefined))).toEqual([
      'limit',
      'naics',
      'offset',
      'postedFrom',
      'postedTo',
    ]);
  });

  it('[GOV-9] keys a description call in its own namespace, so it can never read as a fresh search', () => {
    expect(descriptionKey('sam.gov', 'n-1')).toMatch(/^[0-9a-f]{64}$/);
    expect(descriptionKey('sam.gov', 'n-1')).toBe(descriptionKey('sam.gov', 'n-1'));
    expect(descriptionKey('sam.gov', 'n-1')).not.toBe(descriptionKey('sam.gov', 'n-2'));
    expect(descriptionKey('sam.gov', 'n-1')).not.toBe(descriptionKey('other', 'n-1'));
    expect(descriptionKey('sam.gov', 'n-1')).not.toBe(
      queryKey('sam.gov', { ...base, noticeId: 'n-1' }),
    );
  });

  it('differs by source, by filter and by page', () => {
    const key = queryKey('sam.gov', base);
    expect(queryKey('other', base)).not.toBe(key);
    expect(queryKey('sam.gov', { ...base, naics: '541511' })).not.toBe(key);
    expect(queryKey('sam.gov', nextPage(base))).not.toBe(key);
    expect(nextPage(base).offset).toBe(1000);
  });
});
