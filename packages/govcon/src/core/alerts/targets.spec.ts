import { DEFAULT_ALERT_POLICY } from '@sysdesign/contracts';

import type { TargetRecord } from '../ports';
import { quietTargetAlerts, TARGETS_DIGEST } from './targets';

/** A Monday. */
const T0 = new Date('2026-06-15T12:00:00Z');
const TODAY = '2026-06-15';
const EMAILED = {
  at: '2026-06-05T15:00:00.000Z',
  kind: 'emailed' as const,
  summary: 'Sent it.',
  ref: null,
};

const row = (overrides: Partial<TargetRecord> = {}): TargetRecord => ({
  id: 'target-1',
  kind: 'firm',
  subject: 'JCBMLGPE6Z71',
  label: 'BOOZ ALLEN HAMILTON INC',
  stage: 'contacted',
  notes: '',
  nextAction: 'Ask for the program manager.',
  contacts: [],
  links: [],
  activity: [EMAILED],
  reminderAt: null,
  endsAt: null,
  stageChangedAt: T0,
  createdAt: T0,
  updatedAt: T0,
  ...overrides,
});

describe('the quiet-target rule', () => {
  it('[GOV-39] raises a tracked firm or award whose latest activity awaits a reply and is at least the policy’s business days old, keyed on the target and that outreach, carrying what to do next, under the tracker’s own digest', () => {
    const alerts = quietTargetAlerts([row()], DEFAULT_ALERT_POLICY, 'enfav', TODAY);
    expect(alerts).toEqual([
      {
        topic: 'govcon.target.quiet',
        key: { kind: 'target-quiet', subject: 'firm:JCBMLGPE6Z71|2026-06-05T15:00:00.000Z' },
        payload: {
          profileId: 'enfav',
          kind: 'firm',
          subject: 'JCBMLGPE6Z71',
          label: 'BOOZ ALLEN HAMILTON INC',
          stage: 'contacted',
          lastActivityAt: '2026-06-05T15:00:00.000Z',
          lastActivityKind: 'emailed',
          quietBusinessDays: 6,
          nextAction: 'Ask for the program manager.',
        },
      },
    ]);
    expect(TARGETS_DIGEST).toEqual({
      origin: 'govcon.targets',
      one: 'quiet target',
      many: 'quiet targets',
    });
  });

  it('[GOV-39] raises nothing for a closed pursuit, an activity awaiting no reply, a silence shorter than the policy, a reminder set after the outreach, no activity, or a policy at zero — the latest activity is the latest by its day, and a reminder from before the outreach stands in for nothing', () => {
    const policy = DEFAULT_ALERT_POLICY;
    const none = (overrides: Partial<TargetRecord>, chosen = policy) =>
      expect(quietTargetAlerts([row(overrides)], chosen, 'enfav', TODAY)).toEqual([]);
    none({ stage: 'passed' });
    none({ activity: [{ ...EMAILED, kind: 'replied' }] });
    none({ activity: [{ ...EMAILED, at: '2026-06-10T15:00:00.000Z' }] });
    none({ reminderAt: new Date('2026-06-06T09:00:00Z') });
    none({ activity: [] });
    none({}, { ...policy, followUpAfterBusinessDays: 0 });
    none({
      activity: [
        { at: '2026-06-12T09:00:00.000Z', kind: 'replied', summary: '', ref: null },
        EMAILED,
      ],
    });
    expect(
      quietTargetAlerts(
        [row({ reminderAt: new Date('2026-06-01T09:00:00Z') })],
        policy,
        'enfav',
        TODAY,
      ),
    ).toHaveLength(1);
  });
});
