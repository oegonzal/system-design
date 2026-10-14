import {
  horizonRowOf,
  MAX_RECOMPETE_NOTICES,
  noticeRefOf,
  opportunityOf,
} from '@sysdesign/contracts';

import {
  horizonNaics,
  incumbentPlanOf,
  incumbentsOf,
  matchOpenNotices,
  openNoticesFilter,
} from './recompetes';

const NOW = new Date('2026-06-15T12:00:00Z');

describe('the recompete join', () => {
  it('[GOV-23] joins an expiring award to the open notices sharing its NAICS and agency sub-tier, orders them by deadline then id, skips a row or a notice without either fact, and asks the store for exactly the rows’ distinct NAICS', () => {
    const navy = horizonRowOf();
    const dla = horizonRowOf({ externalId: 'dla', agencyCode: '097.97AS' });
    const bare = horizonRowOf({ externalId: 'bare', naicsCode: null });
    const nowhere = horizonRowOf({ externalId: 'nowhere', agencyCode: null, naicsCode: '541511' });
    const soon = opportunityOf();
    const later = opportunityOf({
      noticeId: 'n-later',
      responseDeadlineAt: '2026-12-01T00:00:00.000Z',
    });
    const open = opportunityOf({ noticeId: 'n-open', responseDeadlineAt: null });
    const navyNotice = opportunityOf({ noticeId: 'n-navy', agencyCode: '097.1700.N00024' });
    const otherCode = opportunityOf({ noticeId: 'n-other', naicsCode: '541511' });
    const codeless = opportunityOf({ noticeId: 'n-codeless', agencyCode: null });

    expect(
      matchOpenNotices(
        [navy, dla, bare, nowhere],
        [later, open, soon, navyNotice, otherCode, codeless],
      ),
    ).toEqual([
      { externalId: navy.externalId, notices: [noticeRefOf(navyNotice)] },
      { externalId: 'dla', notices: [noticeRefOf(soon), noticeRefOf(later), noticeRefOf(open)] },
    ]);
    expect(matchOpenNotices([navy], [])).toEqual([]);

    expect(horizonNaics([navy, dla, bare, nowhere, horizonRowOf({ naicsCode: '111' })])).toEqual([
      '111',
      '332710',
      '541511',
    ]);
    expect(horizonNaics([bare])).toEqual([]);

    expect(openNoticesFilter(['332710'], NOW)).toEqual({
      activeOnly: true,
      postedOnOrAfter: null,
      deadlineOnOrAfter: NOW,
      deadlineOnOrBefore: null,
      setAsideCodes: null,
      excludeNoticeTypes: [],
      naicsPrefix: null,
      naicsCodes: ['332710'],
      setAsideCode: null,
      noticeTypes: null,
      agencyContains: null,
      textContains: null,
      limit: MAX_RECOMPETE_NOTICES,
    });
  });

  it('[GOV-34] plans a notice’s incumbents from its code and its buyer — its product service code only when asked — names the fact it lacks, and keeps of a scope’s awards the ones its own sub-agency holds in its code', () => {
    // DLA Aviation, NAICS 332710, PSC 5340.
    const notice = opportunityOf();
    expect(incumbentPlanOf(notice, true)).toEqual({
      kind: 'read',
      naics: '332710',
      psc: '5340',
      toptier: '097',
    });
    expect(incumbentPlanOf(notice, false)).toMatchObject({ kind: 'read', psc: null });
    expect(incumbentPlanOf({ ...notice, classificationCode: null }, true)).toMatchObject({
      kind: 'read',
      psc: null,
    });
    expect(incumbentPlanOf({ ...notice, naicsCode: null }, true)).toEqual({
      kind: 'gap',
      gap: 'naics',
    });
    // A buyer named only as far as its department cannot be told from any other part of it.
    for (const agencyCode of [null, '097', '097.']) {
      expect(incumbentPlanOf({ ...notice, agencyCode }, true)).toEqual({
        kind: 'gap',
        gap: 'buyer',
      });
    }

    const held = horizonRowOf({ externalId: 'held', agencyCode: '097.97AS' });
    const later = horizonRowOf({
      externalId: 'later',
      agencyCode: '097.97AS',
      endsAt: '2027-01-01',
    });
    const rows = [
      held,
      horizonRowOf({ externalId: 'navy' }),
      horizonRowOf({ externalId: 'other-code', agencyCode: '097.97AS', naicsCode: '541511' }),
      horizonRowOf({ externalId: 'nowhere', agencyCode: null }),
      later,
    ];
    // The order given is kept: the lens lists the soonest-ending first.
    expect(incumbentsOf(notice, rows)).toEqual([held, later]);
    expect(incumbentsOf({ ...notice, naicsCode: null }, rows)).toEqual([]);
    expect(incumbentsOf(notice, [])).toEqual([]);
  });
});
