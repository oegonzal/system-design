import {
  DEFAULT_ALERT_POLICY,
  leadNewSchema,
  opportunityOf,
  type Opportunity,
} from '@sysdesign/contracts';

import { rankLeads } from '../scoring';
import { contextAt, tinyProfile } from '../testing';
import { LEADS_DIGEST, newLeadAlerts } from './leads';

const PROFILE = tinyProfile();
/** Ranked by the tiny profile at the fakes' instant: 92.5 high, 52.5 medium, 40 low, and one its set-aside gate keeps out. */
const NOTICES: Opportunity[] = [
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
const { leads, excluded } = rankLeads(NOTICES, PROFILE, contextAt());
const raisedAt = (newLeadTier: (typeof DEFAULT_ALERT_POLICY)['newLeadTier'], from = leads) =>
  newLeadAlerts(from, { ...DEFAULT_ALERT_POLICY, newLeadTier }, 'tiny').map(
    (alert) => alert.key.subject,
  );

describe('the lead alert rule', () => {
  it('[GOV-36] a ranked notice in the tier the policy names, or a better one, is one alert keyed by its notice and carrying the score and tier it was raised at — a lower tier, a notice a gate excluded and a policy with no tier raise none', () => {
    expect(leads.map((lead) => [lead.opportunity.noticeId, lead.score, lead.tier])).toEqual([
      ['best', 92.5, 'high'],
      ['mid', 52.5, 'medium'],
      ['weak', 40, 'low'],
    ]);
    const [alert, ...rest] = newLeadAlerts(leads, DEFAULT_ALERT_POLICY, 'tiny');
    expect(rest).toEqual([]);
    expect(alert).toEqual({
      topic: 'govcon.lead.new',
      key: { kind: 'lead-new', subject: 'best' },
      payload: {
        profileId: 'tiny',
        noticeId: 'best',
        title: 'Additive manufacturing of replacement brackets',
        noticeType: 'Solicitation',
        agencyPath: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION',
        naicsCode: '332710',
        responseDeadlineAt: '2026-10-10T12:00:00.000Z',
        score: 92.5,
        tier: 'high',
      },
    });
    // What is published is what the topic's schema declares.
    expect(leadNewSchema.parse(alert?.payload)).toEqual(alert?.payload);

    // The tier is a floor: it, and every better one.
    expect(raisedAt('high')).toEqual(['best']);
    expect(raisedAt('medium')).toEqual(['best', 'mid']);
    expect(raisedAt('low')).toEqual(['best', 'mid', 'weak']);
    expect(raisedAt(null)).toEqual([]);
    // A notice a gate of the profile's excluded has no tier, and is never raised.
    expect(excluded.map((lead) => lead.opportunity.noticeId)).toEqual(['gone']);
    expect(raisedAt('low', excluded)).toEqual([]);
    expect(raisedAt('high', [])).toEqual([]);

    expect(LEADS_DIGEST).toEqual({ origin: 'govcon.leads', one: 'new lead', many: 'new leads' });
  });
});
