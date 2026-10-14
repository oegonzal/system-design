import { opportunityOf, sliceReportOf, type Lead, type SearchYield } from '@sysdesign/contracts';
import type { z } from 'zod';

import type { SliceRun } from './pull';
import { rankLeads } from './scoring';
import { contextAt, tinyProfile } from './testing';
import { readYield, searchYieldSchema, yieldOf } from './yield';

const AT = new Date('2026-09-26T12:00:00Z');
const WINDOW = { from: '2026-09-23', to: '2026-09-26' };

/** Ranked by the tiny profile at the fakes' instant: `best` high, `mid` medium, `weak` low; `gone` is a set-aside it cannot bid. */
const NOTICES = [
  opportunityOf({ noticeId: 'best' }),
  opportunityOf({
    noticeId: 'mid',
    naicsCode: '541512',
    naicsCodes: ['541512'],
    classificationCode: null,
    setAsideCode: null,
    title: 'Help desk',
  }),
  opportunityOf({
    noticeId: 'weak',
    naicsCode: '722511',
    naicsCodes: [],
    classificationCode: null,
    title: 'Lawn care',
  }),
  opportunityOf({ noticeId: 'gone', setAsideCode: 'HZC' }),
];
const RANKED = new Map<string, Lead>(
  rankLeads(NOTICES, tinyProfile(), contextAt()).leads.map((lead) => [
    lead.opportunity.noticeId,
    lead,
  ]),
);
const run = (noticeIds: string[], report: Parameters<typeof sliceReportOf>[0] = {}): SliceRun => ({
  slice: { searchId: 's-1', name: 'Machine shops', query: sliceReportOf().query },
  report: sliceReportOf(report),
  noticeIds,
});

describe('a search’s yield', () => {
  it('[GOV-37] counts what a slice’s pages carried the way the leads list would show it — by tier, with what a gate keeps off the list counted together — beside what the source returned and how much of it was new; a notice carried twice is one', () => {
    const found = yieldOf(
      run(['best', 'mid', 'weak', 'gone', 'best', 'never-stored'], {
        pages: 2,
        received: 7,
        inserted: 3,
        truncated: true,
      }),
      RANKED,
      WINDOW,
      AT,
    );
    expect(found).toEqual({
      at: '2026-09-26T12:00:00.000Z',
      window: WINDOW,
      received: 7,
      inserted: 3,
      truncated: true,
      tiers: { high: 1, medium: 1, low: 1 },
      // `gone` is gated out, and `never-stored` is on no list either.
      unlisted: 2,
    });
    // A page that carried nothing is still a read: a yield of nothing.
    expect(yieldOf(run([], { pages: 1, received: 0, inserted: 0 }), RANKED, WINDOW, AT)).toEqual({
      at: '2026-09-26T12:00:00.000Z',
      window: WINDOW,
      received: 0,
      inserted: 0,
      truncated: false,
      tiers: { high: 0, medium: 0, low: 0 },
      unlisted: 0,
    });
  });

  it('[GOV-37] a slice that read no page has no yield — answered from the cache window, skipped, or refused before one — so the yield of its search’s last read stands', () => {
    for (const outcome of ['cached', 'skipped', 'budget-exhausted', 'error'] as const) {
      expect(yieldOf(run([], { outcome, pages: 0 }), RANKED, WINDOW, AT), outcome).toBeNull();
    }
  });

  it('[GOV-37] a stored yield is read through its schema, which is the wire type’s twin: anything it refuses reads as none', () => {
    expectTypeOf<z.output<typeof searchYieldSchema>>().toEqualTypeOf<SearchYield>();
    const stored = yieldOf(run(['best'], { pages: 1 }), RANKED, WINDOW, AT);
    expect(readYield(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(readYield(null)).toBeNull();
    expect(readYield({ ...stored, tiers: { high: 1 } })).toBeNull();
    expect(readYield({ ...stored, received: -1 })).toBeNull();
    expect(readYield({ ...stored, extra: true })).toBeNull();
    expect(readYield('37 read')).toBeNull();
  });
});
