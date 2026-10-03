import { BROWSER_SESSION_TERMINATIONS, TERMINATION_STATUS } from '@sysdesign/contracts';

import { checkRails, RAILS, remainingTasks, type RailState } from './rails';

const RAIL_LIMITS = { maxTasks: 2, maxMinutes: 30, maxConsecutiveFailures: 3, maxBrainFaults: 2 };
const START = new Date('2026-10-03T10:00:00.000Z');
const at = (minutes: number): Date => new Date(START.getTime() + minutes * 60_000);

const state = (overrides: Partial<RailState> = {}): RailState => ({
  startedAt: START,
  tasksStarted: 0,
  tasksClosed: 0,
  openTask: false,
  consecutiveFailures: 0,
  brainFaults: 0,
  operatorStopped: false,
  ...overrides,
});

describe('the rails', () => {
  it('[BRW-4] hold when nothing has tripped, and trip one at a time by declared order', () => {
    expect(checkRails(state(), RAIL_LIMITS, at(1))).toBeNull();
    expect(checkRails(state({ tasksClosed: 2 }), RAIL_LIMITS, at(1))?.reason).toBe('max-tasks');
    expect(
      checkRails(state({ tasksStarted: 2, openTask: false }), RAIL_LIMITS, at(1))?.reason,
    ).toBe('max-tasks');
    expect(checkRails(state({ tasksStarted: 2, openTask: true }), RAIL_LIMITS, at(1))).toBeNull();
    expect(checkRails(state(), RAIL_LIMITS, at(30))?.reason).toBe('max-minutes');
    expect(checkRails(state({ consecutiveFailures: 3 }), RAIL_LIMITS, at(1))?.reason).toBe(
      'max-failures',
    );
    expect(checkRails(state({ brainFaults: 2 }), RAIL_LIMITS, at(1))?.reason).toBe(
      'brain-unavailable',
    );
    // The operator's word outranks every limit.
    const everything = state({
      operatorStopped: true,
      tasksClosed: 9,
      consecutiveFailures: 9,
      brainFaults: 9,
    });
    expect(checkRails(everything, RAIL_LIMITS, at(99))?.reason).toBe('operator-stop');
    expect(checkRails(state({ tasksClosed: 2 }), RAIL_LIMITS, at(1))?.detail).toBe(
      '2 of 2 units of work closed, 0 started',
    );
  });

  it('[BRW-4] names only engine terminations, each with a status in the termination table', () => {
    for (const rail of RAILS) {
      expect(BROWSER_SESSION_TERMINATIONS).toContain(rail.reason);
      expect(TERMINATION_STATUS[rail.reason]).toBe('stopped');
    }
    expect(new Set(RAILS.map((rail) => rail.reason)).size).toBe(RAILS.length);
  });

  it('tells the next plan how many units of work may still open', () => {
    expect(remainingTasks(state(), RAIL_LIMITS)).toBe(2);
    expect(remainingTasks(state({ tasksStarted: 1 }), RAIL_LIMITS)).toBe(1);
    expect(remainingTasks(state({ tasksStarted: 5 }), RAIL_LIMITS)).toBe(0);
  });
});
