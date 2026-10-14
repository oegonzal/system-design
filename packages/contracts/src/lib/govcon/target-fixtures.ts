import type { RaisedAlertView } from './alerts';
import type { Target, TargetSummary } from './target';

/**
 * Wire-shaped builders for what the company tracks and what the daily warm
 * raised about it, each taking overrides. The story is the award fixture's:
 * one order under a vehicle at the Department of Energy, watched since the
 * day it was found, and raised when it came within ninety days of its end.
 */

/** A tracked award: the one the award fixture is, watched since the day it was found. */
export const targetOf = (overrides: Partial<Target> = {}): Target => ({
  id: 't-1',
  kind: 'award',
  subject: 'CONT_AWD_89303019FET000003_8900_89303019AET000001_8900',
  label: '89303019FET000003',
  stage: 'watching',
  notes: '',
  contact: '',
  reminderAt: null,
  endsAt: '2026-12-26',
  stageChangedAt: '2026-09-27T03:00:00.000Z',
  createdAt: '2026-09-27T03:00:00.000Z',
  updatedAt: '2026-09-27T03:00:00.000Z',
  ...overrides,
});

export const targetSummaryOf = (overrides: Partial<TargetSummary> = {}): TargetSummary => ({
  byKind: {
    firm: { identified: 1, contacted: 2, talking: 0, teamed: 0, passed: 1 },
    award: { watching: 3, researching: 1, positioning: 0, pursuing: 0, passed: 0 },
  },
  dueSoon: 1,
  total: 8,
  ...overrides,
});

/** An alert as the ledger reads it back: that tracked award ending, as it was published. */
export const raisedAlertViewOf = (overrides: Partial<RaisedAlertView> = {}): RaisedAlertView => {
  const key = {
    kind: 'award-ending' as const,
    subject: 'CONT_AWD_89303019FET000003_8900_89303019AET000001_8900',
  };
  return {
    id: 'a-1',
    key,
    profileId: 'enfav',
    raisedAt: '2026-09-27T10:41:00.000Z',
    alert: {
      topic: 'govcon.award.ending',
      key,
      payload: {
        profileId: 'enfav',
        scopeKey: null,
        externalId: key.subject,
        piid: '89303019FET000003',
        recipientName: 'BOOZ ALLEN HAMILTON INC',
        agencyPath: 'Department of Energy.Department of Energy.HEADQUARTERS PROCUREMENT SERVICES',
        family: 'contracts',
        naicsCode: '541511',
        amount: 44_095_065.78,
        endsAt: '2026-12-26',
        daysLeft: 90,
      },
    },
    ...overrides,
  };
};
