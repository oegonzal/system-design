import {
  horizonRowOf,
  MAX_RECOMPETE_NOTICES,
  noticeRefOf,
  opportunityOf,
} from '@sysdesign/contracts';

import { horizonNaics, matchOpenNotices, openNoticesFilter } from './recompetes';

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
});
