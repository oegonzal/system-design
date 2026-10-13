import { UsaSpendingFreshness } from './freshness';
import fixture from './fixtures/last-updated.json';
import { USASPENDING_BASE_URL } from './source';
import { httpOf, okValue } from './testing';

describe('the USAspending freshness', () => {
  it('[GOV-11] [GOV-20] gets the day the award data was last loaded and spells it ISO, refusing any other spelling', async () => {
    const { http, urls } = httpOf([{ body: fixture }]);
    const { result } = await new UsaSpendingFreshness(http).lastUpdated();
    expect(urls[0]).toBe(`${USASPENDING_BASE_URL}/api/v2/awards/last_updated/`);
    expect(okValue(result)).toBe('2026-10-12');

    const odd = httpOf([{ body: { last_updated: 'soon' } }]);
    expect((await new UsaSpendingFreshness(odd.http).lastUpdated()).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
      message: 'last_updated: soon',
    });
  });
});
