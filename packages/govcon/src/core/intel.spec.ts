import { awardOf } from '@sysdesign/contracts';

import { awardHistoryOf, offersBand, subtierOf, summarizeAwards } from './intel';

describe('summarizeAwards', () => {
  it('[GOV-17] counts, totals, medians, bands the offers, ranks the awardees and mixes the set-asides, deterministically', () => {
    const awards = [
      awardOf({
        externalId: 'a',
        amount: 100,
        offersReceived: 1,
        setAsideCode: 'SBA',
        awardeeUei: 'U1',
        awardeeName: 'One',
      }),
      awardOf({
        externalId: 'b',
        amount: 300,
        offersReceived: 3,
        setAsideCode: null,
        awardeeUei: 'U1',
        awardeeName: 'One',
      }),
      awardOf({
        externalId: 'c',
        amount: null,
        offersReceived: 9,
        setAsideCode: 'SBA',
        awardeeUei: null,
        awardeeName: 'Two',
      }),
      awardOf({
        externalId: 'd',
        amount: 50,
        offersReceived: null,
        setAsideCode: null,
        awardeeUei: null,
        awardeeName: null,
        source: 'usaspending',
      }),
    ];
    const summary = summarizeAwards(awards);
    expect(summary).toEqual({
      count: 4,
      total: 450,
      median: 100,
      offers: { one: 1, few: 1, many: 1, unknown: 1 },
      topAwardees: [
        { name: 'One', uei: 'U1', count: 2, total: 400 },
        { name: 'Two', uei: null, count: 1, total: 0 },
      ],
      setAsideMix: { SBA: 2, open: 2 },
      bySource: { 'sam.gov': 3, usaspending: 1 },
    });
    expect(summarizeAwards([...awards].reverse())).toEqual(summary);
    expect(summarizeAwards([])).toMatchObject({
      count: 0,
      total: 0,
      median: null,
      topAwardees: [],
    });
    expect(
      summarizeAwards([awardOf({ amount: 10 }), awardOf({ externalId: 'z', amount: 20 })]).median,
    ).toBe(15);
    expect([null, 0, 1, 2, 4, 5, 40].map(offersBand)).toEqual([
      'unknown',
      'one',
      'one',
      'few',
      'few',
      'many',
      'many',
    ]);
  });
});

describe('awardHistoryOf', () => {
  it('counts awards in the NAICS inside the window, and those of the same subtier', () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    const history = awardHistoryOf(
      [
        { naicsCode: '332710', agencyCode: '9700.97AS.SPE4A5', signedAt: '2026-06-25' },
        { naicsCode: '332710', agencyCode: '9700.97AS.SPE4A7', signedAt: '2026-09-01' },
        { naicsCode: '332710', agencyCode: '1400.14L3.140L37', signedAt: '2026-09-25' },
        { naicsCode: '332710', agencyCode: null, signedAt: '2024-01-01' },
        { naicsCode: '541511', agencyCode: '9700.97AS.SPE4A5', signedAt: '2026-09-25' },
      ],
      now,
    );
    expect(history.countFor('332710', '097.97AS.SPE4A7', 365)).toEqual({ same: 3, agency: 2 });
    expect(history.countFor('332710', null, 365)).toEqual({ same: 3, agency: 0 });
    expect(history.countFor('332710', '097.97AS.SPE4A7', 30)).toEqual({ same: 2, agency: 1 });
    expect(history.countFor('999999', '097.97AS.SPE4A7', 365)).toEqual({ same: 0, agency: 0 });
    expect(history.countFor(null, '097.97AS.SPE4A7', 365)).toEqual({ same: 0, agency: 0 });
    expect(subtierOf('9700.97AS.SPE4A5')).toBe('97AS');
    expect(subtierOf('9700')).toBeNull();
    expect(subtierOf(null)).toBeNull();
  });
});
