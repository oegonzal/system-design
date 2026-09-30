import { SAM_GOV_DESCRIPTION_URL, SamGovDescriptions } from './descriptions';
import fixtureDescription from './fixtures/notice-description.json';
import { httpOf, KEY } from './testing';

describe('the SAM.gov description', () => {
  it('[GOV-9] asks noticedesc for the notice with the key, and answers text with no markup', async () => {
    const { http, urls } = httpOf([{ body: fixtureDescription }]);
    const { attempts, result } = await new SamGovDescriptions(http).get('abc123');
    const url = new URL(urls[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(SAM_GOV_DESCRIPTION_URL);
    expect(url.searchParams.get('noticeid')).toBe('abc123');
    expect(url.searchParams.get('api_key')).toBe(KEY);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.value.startsWith('Combined Synopsis/Solicitation\n')).toBe(true);
    expect(result.value).not.toMatch(/<[a-z/][^>]*>/i);
    expect(result.recordCount).toBe(1);
    expect(attempts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('[GOV-3] never retries a rate-limited description, and reports a body without a description as invalid', async () => {
    const limited = httpOf([{ status: 429, body: { error: 'OVER_RATE_LIMIT' } }]);
    const limitedResult = await new SamGovDescriptions(limited.http).get('x');
    expect(limitedResult.result).toMatchObject({ kind: 'error', outcome: 'rate-limited' });
    expect(limitedResult.attempts).toHaveLength(1);
    expect(limited.urls).toHaveLength(1);

    const odd = httpOf([{ body: { something: 'else' } }]);
    expect((await new SamGovDescriptions(odd.http).get('x')).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
      message: expect.stringContaining('description: description'),
    });

    const missing = httpOf([
      { status: 404, body: { error: { message: 'Description Not Found' } } },
    ]);
    expect((await new SamGovDescriptions(missing.http).get('x')).result).toMatchObject({
      kind: 'error',
      outcome: 'error',
      status: 404,
    });
  });
});
