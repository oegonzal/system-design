import { callKey, canonicalQuery, nextPage, snapshotKey, type OpportunityQuery } from './query';

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
    expect(callKey('sam.gov', 'search', reordered)).toBe(callKey('sam.gov', 'search', base));
    expect(callKey('sam.gov', 'search', withUndefined)).toBe(callKey('sam.gov', 'search', base));
    expect(callKey('sam.gov', 'search', base)).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(canonicalQuery(withUndefined))).toEqual([
      'limit',
      'naics',
      'offset',
      'postedFrom',
      'postedTo',
    ]);
  });

  it('[GOV-26] spells an object the same at every depth, so a scope’s facets key one snapshot however they were assembled, and keeps a list in its order', () => {
    const scope = {
      naics: ['541511'],
      facets: { recipientSize: 'small', amount: { min: 1, max: 2 }, setAside: ['NONE', 'SBA'] },
    };
    const reassembled = {
      facets: { setAside: ['NONE', 'SBA'], amount: { max: 2, min: 1 }, recipientSize: 'small' },
      naics: ['541511'],
    };
    expect(snapshotKey('pulse', reassembled)).toBe(snapshotKey('pulse', scope));
    expect(JSON.stringify(canonicalQuery(reassembled))).toBe(JSON.stringify(canonicalQuery(scope)));
    expect(
      snapshotKey('pulse', { ...scope, facets: { ...scope.facets, amount: { min: 1, max: 3 } } }),
    ).not.toBe(snapshotKey('pulse', scope));
    expect(
      snapshotKey('pulse', { ...scope, facets: { ...scope.facets, setAside: ['SBA', 'NONE'] } }),
    ).not.toBe(snapshotKey('pulse', scope));
    expect(canonicalQuery({ b: { d: undefined, c: null }, a: [{ z: 1, y: 2 }] })).toEqual({
      a: [{ y: 2, z: 1 }],
      b: { c: null },
    });
  });

  it('[GOV-9] keys a description call in its own namespace, so it can never read as a fresh search', () => {
    const key = callKey('sam.gov', 'description', { noticeId: 'n-1' });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(callKey('sam.gov', 'description', { noticeId: 'n-1' })).toBe(key);
    expect(callKey('sam.gov', 'description', { noticeId: 'n-2' })).not.toBe(key);
    expect(callKey('other', 'description', { noticeId: 'n-1' })).not.toBe(key);
    expect(callKey('sam.gov', 'search', { ...base, noticeId: 'n-1' })).not.toBe(key);
  });

  it('differs by source, by filter and by page', () => {
    const key = callKey('sam.gov', 'search', base);
    expect(callKey('other', 'search', base)).not.toBe(key);
    expect(callKey('sam.gov', 'search', { ...base, naics: '541511' })).not.toBe(key);
    expect(callKey('sam.gov', 'search', nextPage(base))).not.toBe(key);
    expect(nextPage(base).offset).toBe(1000);
  });
});
