import { httpOf, KEY } from './testing';
import { RETRY_POLICY } from './http';

const URL_ = 'https://api.sam.gov/opportunities/v2/search';
const params = () => new URLSearchParams({ limit: '1' });

describe('the SAM.gov transport', () => {
  it('[GOV-7] sends the key on the request and nowhere else, and redacts it from every message', async () => {
    const ok = httpOf([{ body: { totalRecords: 0 } }]);
    const { attempts, result } = await ok.http.json(URL_, params());
    const url = new URL(ok.urls[0] ?? '');
    expect(url.searchParams.get('api_key')).toBe(KEY);
    expect(url.searchParams.get('limit')).toBe('1');
    expect(result).toEqual({ kind: 'ok', body: { totalRecords: 0 } });
    expect(attempts).toEqual([
      expect.objectContaining({ status: 200, outcome: 'ok', error: null, durationMs: 1000 }),
    ]);

    const unauthorized = httpOf([
      { status: 401, body: { error: { message: `An invalid api_key ${KEY} was supplied` } } },
    ]);
    const denied = await unauthorized.http.get(URL_, params());
    expect(denied.result).toEqual({
      kind: 'error',
      outcome: 'error',
      status: 401,
      message: expect.stringContaining('[api_key]'),
    });
    expect(JSON.stringify(denied)).not.toContain(KEY);
    expect(denied.attempts).toHaveLength(1);

    const dropped = httpOf([{ throws: new Error(`fetch failed for ${URL_}?api_key=${KEY}`) }]);
    const failed = await dropped.http.get(URL_, params());
    expect(JSON.stringify(failed)).not.toContain(KEY);
    expect(failed.attempts.map((a) => a.error)).toEqual([
      expect.stringContaining('[api_key]'),
      expect.stringContaining('[api_key]'),
    ]);
  });

  it('[GOV-10] reports every attempt: a 503 then a 200 is two attempts, each with its status and outcome', async () => {
    const recovered = httpOf([
      { status: 503, headers: { 'retry-after': '2' } },
      { body: { totalRecords: 0 } },
    ]);
    const { attempts, result } = await recovered.http.get(URL_, params());
    expect(result.kind).toBe('ok');
    expect(recovered.urls).toHaveLength(2);
    expect(recovered.sleeps).toEqual([2000]);
    expect(attempts.map((a) => [a.status, a.outcome])).toEqual([
      [503, 'error'],
      [200, 'ok'],
    ]);
    expect(attempts[0]?.startedAt.getTime()).toBeLessThan(attempts[1]?.startedAt.getTime() ?? 0);

    const down = httpOf([
      { status: 500, headers: { 'retry-after': '600' }, text: 'Internal Server Error' },
    ]);
    const twice = await down.http.get(URL_, params());
    expect(twice.result).toEqual({
      kind: 'error',
      outcome: 'error',
      status: 500,
      message: 'status 500 — Internal Server Error',
    });
    expect(twice.attempts).toHaveLength(RETRY_POLICY.attempts);
    expect(down.sleeps).toEqual([RETRY_POLICY.maxDelayMs]);

    const dropped = httpOf([{ throws: new Error('socket hang up') }]);
    expect((await dropped.http.get(URL_, params())).attempts).toHaveLength(2);
    expect(dropped.sleeps).toEqual([RETRY_POLICY.defaultDelayMs]);
  });

  it('[GOV-3] [GOV-10] never retries a rate limit or a timeout — each is one attempt', async () => {
    const limited = httpOf([
      {
        status: 429,
        headers: { 'retry-after': '3600' },
        body: { error: { code: 'OVER_RATE_LIMIT' } },
      },
    ]);
    const { attempts, result } = await limited.http.get(URL_, params());
    expect(result).toMatchObject({ kind: 'error', outcome: 'rate-limited', status: 429 });
    expect(result.kind === 'error' && result.message).toContain('OVER_RATE_LIMIT');
    expect(attempts).toEqual([expect.objectContaining({ status: 429, outcome: 'rate-limited' })]);
    expect(limited.urls).toHaveLength(1);
    expect(limited.sleeps).toEqual([]);

    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const stalled = httpOf([{ throws: timeout }]);
    const stalledResult = await stalled.http.get(URL_, params());
    expect(stalledResult.attempts).toHaveLength(1);
    expect(stalledResult.result).toMatchObject({ kind: 'error', outcome: 'error', status: null });
    expect(stalled.sleeps).toEqual([]);
  });

  it('reports a body it cannot read as invalid-response, and bounds the provider detail it quotes', async () => {
    const notJson = httpOf([{ text: '<html>maintenance</html>' }]);
    expect((await notJson.http.json(URL_, params())).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
      status: 200,
      message: expect.stringContaining('not JSON'),
    });
    const long = httpOf([{ status: 400, text: 'x'.repeat(1000) }]);
    const { result } = await long.http.get(URL_, params());
    expect(result.kind === 'error' && result.message.length).toBeLessThan(220);
  });
});
