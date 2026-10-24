import { SAM_GOV_ENTITIES_URL, SamGovEntities } from './entities';
import fixture from './fixtures/entities-response.json';
import { httpOf, KEY } from './testing';

describe('the SAM.gov entity registry', () => {
  it('[GOV-18] asks for a batch of UEIs with the three sections and the key, and normalizes registration, claims, the website and the exclusion flag', async () => {
    const { http, urls } = httpOf([{ body: fixture }]);
    const warnings: string[] = [];
    const { attempts, result } = await new SamGovEntities(http, SAM_GOV_ENTITIES_URL, (m) =>
      warnings.push(m),
    ).lookup(['JYKDMRSL7U65', 'BROKEN000001']);
    const url = new URL(urls[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(SAM_GOV_ENTITIES_URL);
    expect(url.searchParams.get('ueiSAM')).toBe('JYKDMRSL7U65~BROKEN000001');
    expect(url.searchParams.get('includeSections')).toBe('entityRegistration,coreData,assertions');
    expect(url.searchParams.get('api_key')).toBe(KEY);
    expect(attempts).toHaveLength(1);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.value.rejected).toBe(1);
    expect(result.recordCount).toBe(2);
    expect(result.value.entities).toEqual([
      {
        uei: 'JYKDMRSL7U65',
        cage: '8U976',
        legalName: 'R. L. MORRISSEY & ASSOCIATES, INC',
        registrationStatus: 'Active',
        registrationExpiresAt: '2027-01-19',
        businessTypes: ['2X', 'F', 'MF'],
        sbaCertifications: [],
        naics: [
          { code: '332722', small: true },
          { code: '423840', small: true },
        ],
        psc: [],
        excluded: false,
        website: 'https://www.example.com/rlm',
      },
    ]);
    expect(warnings).toEqual(['sam.gov entities: 1 record(s) did not normalize']);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('reads an excluded registrant and its SBA certifications, and reports an unreadable envelope', async () => {
    const excluded = {
      ...fixture,
      entityData: [
        {
          ...fixture.entityData[1],
          entityRegistration: {
            ...fixture.entityData[1]?.entityRegistration,
            legalBusinessName: 'BARRED CO',
          },
        },
      ],
    };
    const { http } = httpOf([{ body: excluded }]);
    const { result } = await new SamGovEntities(http).lookup(['BROKEN000001']);
    expect(result.kind === 'ok' && result.value.entities[0]).toMatchObject({
      uei: 'BROKEN000001',
      legalName: 'BARRED CO',
      registrationStatus: 'Expired',
      sbaCertifications: ['A6'],
      naics: [{ code: '541511', small: false }],
      psc: ['DA01'],
      excluded: true,
    });
    const odd = httpOf([{ body: { entityData: 'nope' } }]);
    expect((await new SamGovEntities(odd.http).lookup(['X'])).result).toMatchObject({
      kind: 'error',
      outcome: 'invalid-response',
    });
  });
});
