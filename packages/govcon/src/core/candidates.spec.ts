import { MAX_CANDIDATES } from '@sysdesign/contracts';

import { candidateFilterOf } from './candidates';
import { tinyProfile } from './testing';

describe('candidateFilterOf', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('[GOV-15] pushes the profile gates and the request filters down, bounded by MAX_CANDIDATES', () => {
    expect(candidateFilterOf(tinyProfile(), {}, now)).toEqual({
      activeOnly: true,
      deadlineOnOrAfter: now,
      deadlineOnOrBefore: null,
      setAsideCodes: ['SBA', 'SBP'],
      excludeNoticeTypes: ['Award Notice'],
      naicsPrefix: null,
      setAsideCode: null,
      noticeType: null,
      agencyContains: null,
      textContains: null,
      limit: MAX_CANDIDATES,
    });
    expect(
      candidateFilterOf(
        tinyProfile(),
        {
          naics: '5415',
          setAside: 'SBA',
          noticeType: 'Solicitation',
          agency: 'DLA',
          q: 'bracket',
          deadlineWithinDays: 10,
        },
        now,
      ),
    ).toMatchObject({
      deadlineOnOrBefore: new Date('2026-10-06T12:00:00Z'),
      naicsPrefix: '5415',
      setAsideCode: 'SBA',
      noticeType: 'Solicitation',
      agencyContains: 'DLA',
      textContains: 'bracket',
    });
  });
});
