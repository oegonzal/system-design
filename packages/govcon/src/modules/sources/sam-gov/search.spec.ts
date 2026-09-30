import type { OpportunityQuery } from '../../../core/query';
import fixture from './fixtures/search-response.json';
import { SAM_GOV_SEARCH_URL, SamGovSearch, toSamParams } from './search';
import { httpOf, KEY } from './testing';

const query: OpportunityQuery = {
  postedFrom: '2026-09-20',
  postedTo: '2026-09-26',
  limit: 1000,
  offset: 0,
  naics: '332710',
};

function harness(replies: Parameters<typeof httpOf>[0]) {
  const { http, urls } = httpOf(replies);
  const warnings: string[] = [];
  const source = new SamGovSearch(http, SAM_GOV_SEARCH_URL, (m) => warnings.push(m));
  return { source, urls, warnings };
}

describe('the SAM.gov search', () => {
  it('[GOV-7] renders the query under the provider names and answers a normalized page that carries no key', async () => {
    const { source, urls, warnings } = harness([{ body: fixture }]);
    const { attempts, result } = await source.search(query);

    expect(urls).toHaveLength(1);
    const url = new URL(urls[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(SAM_GOV_SEARCH_URL);
    expect(url.searchParams.get('api_key')).toBe(KEY);
    expect(url.searchParams.get('postedFrom')).toBe('09/20/2026');
    expect(url.searchParams.get('postedTo')).toBe('09/26/2026');
    expect(url.searchParams.get('limit')).toBe('1000');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.get('ncode')).toBe('332710');

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.totalRecords).toBe(4);
    expect(result.recordCount).toBe(4);
    expect(result.value.opportunities).toHaveLength(3);
    expect(result.value.rejected).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(warnings).toEqual(['sam.gov: 1 record(s) did not normalize']);
  });

  it('reports an envelope it cannot read as invalid-response, never as records', async () => {
    const wrongShape = harness([{ body: { opportunitiesData: 'nope' } }]);
    expect((await wrongShape.source.search(query)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
      message: expect.stringContaining('envelope: totalRecords'),
    });
    const empty = harness([{ body: { totalRecords: 0 } }]);
    expect((await empty.source.search(query)).result).toEqual({
      kind: 'ok',
      value: { opportunities: [], rejected: [], totalRecords: 0 },
      recordCount: 0,
      totalRecords: 0,
    });
    const denied = harness([{ status: 403, text: 'forbidden' }]);
    expect((await denied.source.search(query)).result).toMatchObject({
      kind: 'error',
      status: 403,
    });
  });
});

describe('toSamParams', () => {
  it('renders every filter under the provider name and never includes a key', () => {
    const params = toSamParams({
      postedFrom: '2026-01-05',
      postedTo: '2026-02-01',
      limit: 10,
      offset: 20,
      noticeType: 'o',
      naics: '5415',
      psc: 'DA01',
      setAside: 'SBA',
      status: 'active',
      title: 'brackets',
      solicitationNumber: 'S-1',
      noticeId: 'n-1',
      state: 'VA',
      zip: '23297',
      organizationName: 'DLA',
      organizationCode: '097',
      deadlineFrom: '2026-02-01',
      deadlineTo: '2026-03-01',
    });
    expect(Object.fromEntries(params)).toEqual({
      postedFrom: '01/05/2026',
      postedTo: '02/01/2026',
      limit: '10',
      offset: '20',
      ptype: 'o',
      ncode: '5415',
      ccode: 'DA01',
      typeOfSetAside: 'SBA',
      status: 'active',
      title: 'brackets',
      solnum: 'S-1',
      noticeid: 'n-1',
      state: 'VA',
      zip: '23297',
      organizationName: 'DLA',
      organizationCode: '097',
      rdlfrom: '02/01/2026',
      rdlto: '03/01/2026',
    });
    expect(params.has('api_key')).toBe(false);
  });
});
