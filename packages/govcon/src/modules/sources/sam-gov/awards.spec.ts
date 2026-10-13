import { SAM_GOV_AWARDS_URL, SamGovAwards, toSamAwardParams } from './awards';
import fixture from './fixtures/awards-response.json';
import { normalizeSamAward } from './normalize-award';
import { httpOf, KEY } from './testing';

const request = {
  naics: ['332710'],
  psc: [],
  from: '2026-06-01',
  to: '2026-09-29',
  limit: 100,
  offset: 0,
};

describe('the SAM.gov contract awards', () => {
  it('[GOV-17] asks by code and signed window under the provider spellings, with the key, and normalizes what came back', async () => {
    const { http, urls } = httpOf([{ body: fixture }]);
    const warnings: string[] = [];
    const { attempts, result } = await new SamGovAwards(http, SAM_GOV_AWARDS_URL, (m) =>
      warnings.push(m),
    ).search(request);
    const url = new URL(urls[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(SAM_GOV_AWARDS_URL);
    expect(url.searchParams.get('naicsCode')).toBe('332710');
    expect(url.searchParams.get('dateSigned')).toBe('[06/01/2026,09/29/2026]');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('api_key')).toBe(KEY);
    expect(attempts).toHaveLength(1);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.value.awards).toHaveLength(2);
    expect(result.value.rejected).toBe(1);
    expect(result.value.totalRecords).toBe(207);
    expect(result.value.hasMore).toBe(true);
    expect(result.recordCount).toBe(3);
    expect(result.value.awards[0]).toEqual({
      source: 'sam.gov',
      externalId: 'SPE4A526P6036-0',
      piid: 'SPE4A526P6036',
      awardType: 'PURCHASE ORDER',
      solicitationNumber: 'SPE4A626T74X8',
      naicsCode: '332710',
      pscCode: '4920',
      agencyPath: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION',
      agencyCode: '9700.97AS.SPE4A5',
      awardeeName: 'R. L. MORRISSEY & ASSOCIATES, INC',
      awardeeUei: 'JYKDMRSL7U65',
      amount: 220.15,
      offersReceived: 1,
      extentCompeted: 'G',
      setAsideCode: null,
      signedAt: '2026-06-25',
      popStartAt: '2026-06-25',
      completionAt: '2026-09-18',
      placeOfPerformance: { city: 'SOLON', state: 'OH', zip: '441393940', country: 'USA' },
    });
    expect(warnings).toEqual(['sam.gov awards: 1 record(s) did not normalize']);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("[GOV-17] reads the provider's 999 offers as not counted, and every real count as itself", () => {
    const record = fixture.awardSummary[0];
    const withOffers = (numberOfOffersReceived: number | string) =>
      normalizeSamAward(
        {
          ...record,
          awardDetails: {
            ...record?.awardDetails,
            competitionInformation: { numberOfOffersReceived },
          },
        },
        'sam.gov',
      );
    const offersOf = (answer: ReturnType<typeof normalizeSamAward>) =>
      answer.ok ? answer.award.offersReceived : 'rejected';
    expect(offersOf(withOffers(999))).toBeNull();
    expect(offersOf(withOffers('999'))).toBeNull();
    expect(offersOf(withOffers(998))).toBe(998);
    expect(offersOf(withOffers(3))).toBe(3);
  });

  it('joins codes and pages by index the way the provider counts, reports an unreadable envelope, and says when the last page was reached', async () => {
    expect(
      Object.fromEntries(
        toSamAwardParams({ ...request, naics: ['332710', '541511'], psc: ['4920'], offset: 200 }),
      ),
    ).toEqual({
      dateSigned: '[06/01/2026,09/29/2026]',
      limit: '100',
      offset: '2',
      naicsCode: '332710~541511',
      productOrServiceCode: '4920',
    });
    const odd = httpOf([{ body: { totalRecords: 'x', awardSummary: 'nope' } }]);
    expect((await new SamGovAwards(odd.http).search(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
    const last = httpOf([{ body: { ...fixture, totalRecords: '3' } }]);
    const { result } = await new SamGovAwards(last.http).search(request);
    expect(result.kind === 'ok' && result.value.hasMore).toBe(false);
    const limited = httpOf([{ status: 429, body: { error: 'OVER_RATE_LIMIT' } }]);
    expect((await new SamGovAwards(limited.http).search(request)).result).toMatchObject({
      kind: 'error',
      outcome: 'rate-limited',
    });
  });
});
