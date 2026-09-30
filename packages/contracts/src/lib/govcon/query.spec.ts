import { describeCall, describeQuery } from './query';

describe('describeQuery', () => {
  it('lists the filters, skipping paging and absent values, and names the page after the first', () => {
    expect(describeQuery({ naics: '332710', status: 'active', psc: undefined })).toBe(
      'naics=332710 status=active',
    );
    expect(describeQuery({})).toBe('all notices');
    expect(
      describeQuery({
        postedFrom: '2026-09-20',
        postedTo: '2026-09-26',
        limit: 100,
        offset: 200,
        naics: '332710',
      }),
    ).toBe('naics=332710 page 3');
    expect(describeQuery({ limit: 100, offset: 0 })).toBe('all notices');
  });
});

describe('describeCall', () => {
  it('describes every operation by its own query shape', () => {
    expect(describeCall({ operation: 'description', query: { noticeId: 'n-1' } })).toBe(
      'description n-1',
    );
    expect(describeCall({ operation: 'attachment', query: { noticeId: 'n-1', ordinal: 0 } })).toBe(
      'attachment 1 of n-1',
    );
    expect(
      describeCall({
        operation: 'awards',
        query: {
          naics: '332710',
          psc: null,
          from: '2026-01-01',
          to: '2026-06-30',
          limit: 100,
          offset: 100,
        },
      }),
    ).toBe('awards naics=332710 signed 2026-01-01..2026-06-30 page 2');
    expect(
      describeCall({
        operation: 'spending',
        query: {
          naics: ['332710'],
          psc: [],
          from: '2026-01-01',
          to: '2026-06-30',
          page: 1,
          limit: 100,
        },
      }),
    ).toBe('spending naics=332710 psc=* 2026-01-01..2026-06-30 page 1');
    expect(describeCall({ operation: 'entity', query: { ueis: ['A', 'B'] } })).toBe(
      'entity 2 ueis',
    );
    expect(describeCall({ operation: 'entity', query: { ueis: ['A'] } })).toBe('entity A');
    expect(describeCall({ operation: 'exclusions', query: { uei: 'A' } })).toBe('exclusions A');
    expect(
      describeCall({
        operation: 'search',
        query: {
          postedFrom: '2026-09-20',
          postedTo: '2026-09-26',
          limit: 100,
          offset: 0,
          naics: '332710',
        },
      }),
    ).toBe('naics=332710');
  });
});
