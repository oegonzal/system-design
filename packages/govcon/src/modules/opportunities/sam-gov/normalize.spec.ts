import fixture from './fixtures/search-response.json';
import { normalizePage, normalizeRecord, parseSamDate } from './normalize';

const records = fixture.opportunitiesData as unknown[];

describe('normalizing SAM.gov records', () => {
  it('[GOV-1] keeps every record that can be a lead and counts the one that cannot, with reasons', () => {
    const { opportunities, rejected } = normalizePage(records, 'sam.gov');
    expect(opportunities.map((o) => o.noticeId)).toEqual([
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
      'ffeeddccbbaa99887766554433221100',
    ]);
    expect(rejected).toEqual([{ noticeId: null, issues: [expect.stringMatching(/^noticeId: /)] }]);
  });

  it('[GOV-1] reads the provider fields into the contract shape, unknown keys tolerated', () => {
    const first = normalizeRecord(records[0], 'sam.gov');
    if (!first.ok) throw new Error('expected ok');
    expect(first.opportunity).toEqual({
      noticeId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      title: 'Additive Manufacturing of Replacement Brackets, Qty 400',
      solicitationNumber: 'SPE4A7-26-Q-0001',
      agencyPath: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION',
      agencyCode: '097.97AS.SPE4A7',
      postedAt: '2026-09-20T00:00:00.000Z',
      responseDeadlineAt: '2026-10-10T20:00:00.000Z',
      archiveAt: '2026-10-25T00:00:00.000Z',
      archiveType: 'auto15',
      noticeType: 'Solicitation',
      baseType: 'Solicitation',
      active: true,
      naicsCode: '332710',
      naicsCodes: ['332710'],
      classificationCode: '5340',
      setAsideCode: 'SBA',
      setAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)',
      organizationType: 'OFFICE',
      placeOfPerformance: { city: 'Richmond', state: 'VA', zip: '23297', country: 'USA' },
      officeAddress: { city: 'RICHMOND', state: 'VA', zip: '23297', countryCode: 'USA' },
      pointsOfContact: [
        {
          type: 'primary',
          title: null,
          fullName: 'A. Buyer',
          email: 'a.buyer@dla.mil',
          phone: null,
        },
      ],
      descriptionUrl:
        'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=a1b2c3d4e5f60718293a4b5c6d7e8f90',
      uiLink: 'https://sam.gov/opp/a1b2c3d4e5f60718293a4b5c6d7e8f90/view',
      additionalInfoLink: null,
      resourceLinks: [
        'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/abc/download',
      ],
      award: null,
      source: 'sam.gov',
    });
  });

  it('[GOV-1] falls back across the provider spellings: naicsCodes without naicsCode, space-separated dates, empty lists', () => {
    const second = normalizeRecord(records[1], 'sam.gov');
    if (!second.ok) throw new Error('expected ok');
    expect(second.opportunity).toMatchObject({
      postedAt: '2026-09-21T14:03:11.000Z',
      responseDeadlineAt: null,
      naicsCode: '541511',
      naicsCodes: ['541511', '541512'],
      setAsideCode: null,
      classificationCode: 'DA01',
      pointsOfContact: [],
      resourceLinks: [],
      officeAddress: null,
      placeOfPerformance: null,
    });
  });

  it('[GOV-1] reads awards, numeric strings and partial places', () => {
    const third = normalizeRecord(records[2], 'sam.gov');
    if (!third.ok) throw new Error('expected ok');
    expect(third.opportunity).toMatchObject({
      postedAt: '2026-09-22T13:15:00.000Z',
      active: false,
      award: {
        date: '2026-09-22T00:00:00.000Z',
        number: 'SPE7M326V0007',
        amount: 48250,
        awardeeName: 'SOME OTHER SMALL BUSINESS LLC',
        awardeeUei: 'ABCDEFGHIJ12',
      },
      placeOfPerformance: { city: null, state: null, zip: '45402', country: 'USA' },
      pointsOfContact: [
        {
          type: 'primary',
          title: null,
          fullName: 'B. Officer',
          email: 'b.officer@dla.mil',
          phone: null,
        },
      ],
    });
  });

  it('[GOV-1] rejects a record whose posted date cannot be read, naming the field', () => {
    const result = normalizeRecord(
      { noticeId: 'x', title: 't', postedDate: 'yesterday' },
      'sam.gov',
    );
    expect(result).toEqual({
      ok: false,
      rejected: { noticeId: 'x', issues: ['postedDate: missing or unreadable'] },
    });
    expect(normalizeRecord('not even an object', 'sam.gov').ok).toBe(false);
    expect(normalizeRecord({ noticeId: 42 }, 'sam.gov')).toMatchObject({
      ok: false,
      rejected: { noticeId: null },
    });
  });

  it('titles a record by its solicitation number, then its notice id, when the title is blank', () => {
    const untitled = normalizeRecord(
      { noticeId: 'n', title: '  ', solicitationNumber: 'S-1', postedDate: '2026-01-01' },
      'sam.gov',
    );
    const bare = normalizeRecord({ noticeId: 'n', postedDate: '2026-01-01' }, 'sam.gov');
    expect(untitled.ok && untitled.opportunity.title).toBe('S-1');
    expect(bare.ok && bare.opportunity.title).toBe('n');
  });
});

describe('parseSamDate', () => {
  it.each([
    ['2026-09-20', '2026-09-20T00:00:00.000Z'],
    ['2026-09-20 14:03:11', '2026-09-20T14:03:11.000Z'],
    ['2026-09-20 14:03', '2026-09-20T14:03:00.000Z'],
    ['2026-09-20T14:03:11-04:00', '2026-09-20T18:03:11.000Z'],
    ['2026-09-20T14:03:11.000+00:00', '2026-09-20T14:03:11.000Z'],
    [' 2026-09-20 ', '2026-09-20T00:00:00.000Z'],
  ])('reads %s as %s', (input, expected) => {
    expect(parseSamDate(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'yesterday', '09/20/2026', '2026-13-45'])(
    'reads %s as unknown',
    (input) => {
      expect(parseSamDate(input)).toBeNull();
    },
  );
});
