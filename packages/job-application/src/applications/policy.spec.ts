import { skippedEnough, stanceOf, standingOf, type ScatterPolicy } from './policy';
import { application } from './testing';

const NOW = new Date('2026-10-11T12:00:00.000Z');
const POLICY: ScatterPolicy = {
  windowDays: 90,
  stances: {
    'in-progress': 'forbid',
    submitted: 'avoid',
    'submitted-before': 'avoid',
    abandoned: 'avoid',
    failed: null,
    skipped: null,
  },
  neverOnRecord: ['Staffing Partners'],
  skippedBecomesAvoidAfter: 2,
};

describe('the stance a record takes', () => {
  it('[JA-1] reads the stance from the status map within the window, and says nothing outside it or for a status without one', () => {
    expect(stanceOf(application({ status: 'submitted' }), POLICY, NOW)).toBe('avoid');
    expect(stanceOf(application({ status: 'submitted-before' }), POLICY, NOW)).toBe('avoid');
    expect(stanceOf(application({ status: 'failed' }), POLICY, NOW)).toBeNull();
    expect(stanceOf(application({ status: 'skipped' }), POLICY, NOW)).toBeNull();
    const old = new Date('2026-07-01T10:00:00.000Z');
    expect(stanceOf(application({ openedAt: old, closedAt: old }), POLICY, NOW)).toBeNull();
    // The window is read on the last move: a close inside it counts whenever it opened.
    expect(
      stanceOf(
        application({ openedAt: old, closedAt: new Date('2026-10-01T10:00:00.000Z') }),
        POLICY,
        NOW,
      ),
    ).toBe('avoid');
  });

  it('[JA-1] a unit in progress is forbidden until its session’s declared lifetime has passed, when it stands as abandoned', () => {
    const open = application({
      status: 'in-progress',
      openedAt: new Date('2026-10-11T11:00:00.000Z'),
      closedAt: null,
      expiresAt: new Date('2026-10-11T13:00:00.000Z'),
    });
    expect([standingOf(open, NOW), stanceOf(open, POLICY, NOW)]).toEqual(['in-progress', 'forbid']);
    const expired = { ...open, expiresAt: new Date('2026-10-11T11:30:00.000Z') };
    expect([standingOf(expired, NOW), stanceOf(expired, POLICY, NOW)]).toEqual([
      'abandoned',
      'avoid',
    ]);
  });

  it('[JA-1] a value that identifies no single employer is never on record, under the shared key, and set-asides count against a declared number', () => {
    expect(stanceOf(application({ company: 'staffing partners' }), POLICY, NOW)).toBeNull();
    expect(stanceOf(application({ company: 'Acme' }), POLICY, NOW)).toBe('avoid');
    expect([skippedEnough(POLICY, 1), skippedEnough(POLICY, 2)]).toEqual([false, true]);
    expect(skippedEnough({ ...POLICY, skippedBecomesAvoidAfter: null }, 9)).toBe(false);
  });
});
