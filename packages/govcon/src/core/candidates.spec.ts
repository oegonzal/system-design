import { MAX_CANDIDATES } from '@sysdesign/contracts';

import { candidateFilterOf } from './candidates';
import { tinyProfile } from './testing';

describe('candidateFilterOf', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('[GOV-15] pushes the profile gates and the request filters down, bounded by MAX_CANDIDATES', () => {
    expect(candidateFilterOf(tinyProfile(), {}, now)).toEqual({
      activeOnly: true,
      postedOnOrAfter: new Date('2026-05-29T12:00:00Z'),
      deadlineOnOrAfter: now,
      deadlineOnOrBefore: null,
      setAsideCodes: ['SBA', 'SBP'],
      excludeNoticeTypes: ['Award Notice'],
      naicsPrefix: null,
      naicsCodes: null,
      setAsideCode: null,
      noticeTypes: null,
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
          noticeTypes: ['Solicitation', 'Presolicitation'],
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
      noticeTypes: ['Solicitation', 'Presolicitation'],
      agencyContains: 'DLA',
      textContains: 'bracket',
    });
  });
});
