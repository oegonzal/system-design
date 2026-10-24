import { DUE_SOON_DAYS, MAX_WATCHED_AWARDS } from '@sysdesign/contracts';

import type { TargetRecord } from './ports';
import { summarizeTargets, watchedAwards } from './targets';

const T0 = new Date('2026-06-15T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): Date => new Date(T0.getTime() + days * DAY_MS);

const target = (overrides: Partial<TargetRecord> = {}): TargetRecord => ({
  id: 'target-1',
  kind: 'award',
  subject: 'CONT_AWD_1',
  label: 'N6660426P0205',
  stage: 'watching',
  notes: '',
  nextAction: '',
  contacts: [],
  links: [],
  activity: [],
  reminderAt: null,
  endsAt: null,
  stageChangedAt: T0,
  createdAt: T0,
  updatedAt: T0,
  ...overrides,
});

describe('the target rules', () => {
  it('[GOV-31] counts every stage of every kind, zero included, what is due soon by its reminder alone, and the total', () => {
    const summary = summarizeTargets(
      [
        target(),
        target({ subject: 'CONT_AWD_2', stage: 'positioning', reminderAt: inDays(DUE_SOON_DAYS) }),
        target({
          kind: 'firm',
          subject: 'JCBMLGPE6Z71',
          stage: 'contacted',
          reminderAt: inDays(-2),
        }),
        target({ kind: 'firm', subject: 'SMNWM6HN79X5', stage: 'passed' }),
        // An award's end is not the tracker's deadline: only a reminder makes a target due.
        target({
          subject: 'CONT_AWD_3',
          endsAt: '2026-06-16',
          reminderAt: inDays(DUE_SOON_DAYS + 1),
        }),
      ],
      T0.getTime(),
    );
    expect(summary).toEqual({
      byKind: {
        firm: { identified: 0, contacted: 1, talking: 0, teamed: 0, passed: 1 },
        award: { watching: 2, researching: 0, positioning: 1, pursuing: 0, passed: 0 },
      },
      dueSoon: 2,
      total: 5,
    });
    expect(summarizeTargets([], T0.getTime())).toMatchObject({ dueSoon: 0, total: 0 });
  });

  it('[GOV-32] the awards a warm reads are the award targets still being pursued — never a firm, never one passed on — the never-read first and then the soonest to end, so a bound cuts the ones furthest from their end', () => {
    const rows = [
      target({ subject: 'late', endsAt: '2028-01-01' }),
      target({ subject: 'soon', endsAt: '2026-07-01' }),
      target({ subject: 'unread-b' }),
      target({ subject: 'unread-a' }),
      target({ subject: 'gone', stage: 'passed', endsAt: '2026-06-20' }),
      target({ kind: 'firm', subject: 'JCBMLGPE6Z71', stage: 'talking' }),
    ];
    expect(watchedAwards(rows, MAX_WATCHED_AWARDS).map((row) => row.subject)).toEqual([
      'unread-a',
      'unread-b',
      'soon',
      'late',
    ]);
    expect(watchedAwards(rows, 3).map((row) => row.subject)).toEqual([
      'unread-a',
      'unread-b',
      'soon',
    ]);
    expect(watchedAwards([], MAX_WATCHED_AWARDS)).toEqual([]);
  });
});
