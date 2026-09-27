import type { OpportunityQuery } from '../../../core/query';
import fixture from './fixtures/search-response.json';
import fixtureDescription from './fixtures/notice-description.json';
import {
  SAM_GOV_DESCRIPTION_URL,
  SAM_GOV_SEARCH_URL,
  SamGovSource,
  toSamParams,
} from './sam-gov-source';

const KEY = 'secret-key-1234567890';
const query: OpportunityQuery = {
  postedFrom: '2026-09-20',
  postedTo: '2026-09-26',
  limit: 1000,
  offset: 0,
  naics: '332710',
};

interface Reply {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
  throws?: Error;
}

/** Scripted replies in order (the last repeats), built as real Responses; every request is remembered. */
function transport(replies: readonly Reply[]) {
  const urls: string[] = [];
  let call = 0;
  const fetch = vi.fn(async (url: string) => {
    urls.push(url);
    const reply = replies[Math.min(call, replies.length - 1)] ?? {};
    call += 1;
    if (reply.throws) throw reply.throws;
    const body = reply.text ?? (reply.body === undefined ? null : JSON.stringify(reply.body));
    return new Response(body, {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    });
  });
  return { fetch, urls };
}

function harness(replies: readonly Reply[]) {
  const { fetch, urls } = transport(replies);
  const sleeps: number[] = [];
  const warnings: string[] = [];
  const source = new SamGovSource({
    apiKey: KEY,
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    warn: (m) => warnings.push(m),
  });
  return { source, fetch, urls, sleeps, warnings };
}

describe('the SAM.gov source', () => {
  it('[GOV-7] sends the key on the request and nowhere else — the normalized page carries none of it', async () => {
    const { source, urls, warnings } = harness([{ body: fixture }]);
    const result = await source.search(query);

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
    expect(result.opportunities).toHaveLength(3);
    expect(result.rejected).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(warnings).toEqual(['sam.gov: 1 record(s) did not normalize']);
  });

  it('[GOV-7] redacts the key from every provider message and every transport error', async () => {
    const unauthorized = harness([
      { status: 401, body: { error: { message: `An invalid api_key ${KEY} was supplied` } } },
    ]);
    const denied = await unauthorized.source.search(query);
    expect(denied).toEqual({
      kind: 'error',
      outcome: 'error',
      status: 401,
      message: expect.stringContaining('[api_key]'),
    });
    expect(JSON.stringify(denied)).not.toContain(KEY);

    const dropped = harness([
      { throws: new Error(`fetch failed for ${SAM_GOV_SEARCH_URL}?api_key=${KEY}`) },
    ]);
    const failed = await dropped.source.search(query);
    expect(failed).toMatchObject({ kind: 'error', outcome: 'error', status: null });
    expect(JSON.stringify(failed)).not.toContain(KEY);
    expect(dropped.urls).toHaveLength(2); // one retry on a dropped connection
    expect(dropped.sleeps).toEqual([1000]);
  });

  it('[GOV-3] never retries a rate limit — a second request against a spent quota is a spent request', async () => {
    const { source, urls, sleeps } = harness([
      {
        status: 429,
        headers: { 'retry-after': '3600' },
        body: { error: { code: 'OVER_RATE_LIMIT' } },
      },
    ]);
    const result = await source.search(query);
    expect(result).toMatchObject({ kind: 'error', outcome: 'rate-limited', status: 429 });
    expect(result.kind === 'error' && result.message).toContain('OVER_RATE_LIMIT');
    expect(urls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('retries a server error once, honouring retry-after clamped to ten seconds', async () => {
    const recovered = harness([
      { status: 503, headers: { 'retry-after': '2' } },
      { body: fixture },
    ]);
    expect((await recovered.source.search(query)).kind).toBe('ok');
    expect(recovered.urls).toHaveLength(2);
    expect(recovered.sleeps).toEqual([2000]);

    const down = harness([
      { status: 500, headers: { 'retry-after': '600' }, text: 'Internal Server Error' },
    ]);
    expect(await down.source.search(query)).toEqual({
      kind: 'error',
      outcome: 'error',
      status: 500,
      message: 'status 500 — Internal Server Error',
    });
    expect(down.urls).toHaveLength(2);
    expect(down.sleeps).toEqual([10_000]);
  });

  it('reports a body it cannot read as invalid-response, never as records', async () => {
    const notJson = harness([{ text: '<html>maintenance</html>' }]);
    expect(await notJson.source.search(query)).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
      status: 200,
      message: expect.stringContaining('not JSON'),
    });
    const wrongShape = harness([{ body: { opportunitiesData: 'nope' } }]);
    expect(await wrongShape.source.search(query)).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
      message: expect.stringContaining('envelope: totalRecords'),
    });
    const empty = harness([{ body: { totalRecords: 0 } }]);
    expect(await empty.source.search(query)).toEqual({
      kind: 'ok',
      opportunities: [],
      rejected: [],
      totalRecords: 0,
    });
  });

  it('bounds the provider detail it quotes and copes with a body it cannot read', async () => {
    const long = harness([{ status: 400, text: 'x'.repeat(1000) }]);
    const result = await long.source.search(query);
    expect(result.kind === 'error' && result.message.length).toBeLessThan(220);
  });
});

describe('the SAM.gov description', () => {
  it('[GOV-9] asks noticedesc for the notice with the key, and answers text with the body as received', async () => {
    const { source, urls } = harness([{ body: fixtureDescription }]);
    const result = await source.describe('abc123');
    const url = new URL(urls[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(SAM_GOV_DESCRIPTION_URL);
    expect(url.searchParams.get('noticeid')).toBe('abc123');
    expect(url.searchParams.get('api_key')).toBe(KEY);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.text.startsWith('Combined Synopsis/Solicitation\n')).toBe(true);
    expect(result.text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(result.raw).toEqual(fixtureDescription);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('[GOV-3] never retries a rate-limited description, and reports a body without a description as invalid', async () => {
    const limited = harness([{ status: 429, body: { error: 'OVER_RATE_LIMIT' } }]);
    expect(await limited.source.describe('x')).toMatchObject({
      kind: 'error',
      outcome: 'rate-limited',
    });
    expect(limited.urls).toHaveLength(1);

    const odd = harness([{ body: { something: 'else' } }]);
    expect(await odd.source.describe('x')).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
      message: expect.stringContaining('description: description'),
    });

    const missing = harness([
      { status: 404, body: { error: { message: 'Description Not Found' } } },
    ]);
    expect(await missing.source.describe('x')).toMatchObject({
      kind: 'error',
      outcome: 'error',
      status: 404,
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
