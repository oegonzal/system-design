import { AttemptedHttp } from '../http';
import { transportOf } from '../sam-gov/testing';
import { toSpendingBody, USASPENDING_BASE_URL, UsaSpendingAwards } from './awards';
import fixture from './fixtures/spending-response.json';

const request = {
  naics: ['332710'],
  psc: [],
  from: '2026-06-01',
  to: '2026-09-29',
  page: 1,
  limit: 100,
};

function harness(replies: Parameters<typeof transportOf>[0]) {
  const { fetch, urls } = transportOf(replies);
  const requests: RequestInit[] = [];
  const http = new AttemptedHttp({
    fetch: (url, init) => {
      requests.push(init);
      return fetch(url);
    },
    sleep: async () => undefined,
    now: () => new Date('2026-09-26T12:00:00Z'),
  });
  return { source: new UsaSpendingAwards(http), urls, requests };
}

describe('the USAspending awards', () => {
  it('[GOV-11] [GOV-17] posts the filters without any key and normalizes the results, paging by hasNext', async () => {
    const { source, urls, requests } = harness([{ body: fixture }]);
    const { attempts, result } = await source.search(request);
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/search/spending_by_award/`);
    expect(urls[0]).not.toContain('api_key');
    expect(requests[0]?.method).toBe('POST');
    expect(JSON.parse(String(requests[0]?.body))).toEqual(toSpendingBody(request));
    expect(attempts).toHaveLength(1);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.value.awards).toHaveLength(3);
    expect(result.value.hasMore).toBe(true);
    expect(result.value.totalRecords).toBeNull();
    expect(result.value.awards[0]).toEqual({
      source: 'usaspending',
      externalId: 'CONT_AWD_FA865021C5000_9700_-NONE-_-NONE-',
      solicitationNumber: null,
      naicsCode: '332710',
      pscCode: 'AC13',
      agencyPath: 'Department of Defense.Department of the Air Force',
      agencyCode: null,
      awardeeName: 'GLOBE MACHINE MANUFACTURING COMPANY',
      awardeeUei: 'VADFZLHBJDJ9',
      amount: 17152539,
      offersReceived: null,
      extentCompeted: null,
      setAsideCode: null,
      signedAt: '2021-08-03',
      completionAt: '2026-08-16',
      placeOfPerformance: { city: null, state: 'WA', zip: null, country: null },
    });
  });

  it('spells the body as the API expects, and reports an unreadable envelope', async () => {
    expect(toSpendingBody({ ...request, psc: ['4920'] })).toMatchObject({
      filters: {
        time_period: [{ start_date: '2026-06-01', end_date: '2026-09-29' }],
        award_type_codes: ['A', 'B', 'C', 'D'],
        naics_codes: { require: ['332710'] },
        psc_codes: { require: ['4920'] },
      },
      page: 1,
      limit: 100,
    });
    expect(toSpendingBody({ ...request, naics: [] }).filters).not.toHaveProperty('naics_codes');
    const odd = harness([{ body: { results: 'nope' } }]);
    expect((await odd.source.search(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
    const broken = harness([
      { body: { results: [{ generated_internal_id: 'x' }], page_metadata: { hasNext: false } } },
    ]);
    const { result } = await broken.source.search(request);
    expect(
      result.kind === 'ok' && [
        result.value.awards.length,
        result.value.rejected,
        result.value.hasMore,
      ],
    ).toEqual([0, 1, false]);
  });
});
