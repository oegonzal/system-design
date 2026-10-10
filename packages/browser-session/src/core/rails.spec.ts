import { BROWSER_SESSION_TERMINATIONS, TERMINATION_STATUS } from '@sysdesign/contracts';

import { checkRails, RAILS, remainingTasks, type RailState } from './rails';

const RAIL_LIMITS = {
  targetDone: null,
  maxTasks: 2,
  maxMinutes: 30,
  maxConsecutiveFailures: 3,
  maxBrainFaults: 2,
  maxUnreadablePages: 2,
  maxStalledSteps: 2,
};
const START = new Date('2026-10-03T10:00:00.000Z');
const at = (minutes: number): Date => new Date(START.getTime() + minutes * 60_000);

const state = (overrides: Partial<RailState> = {}): RailState => ({
  startedAt: START,
  tasksStarted: 0,
  tasksDone: 0,
  tasksSpent: 0,
  openTask: false,
  consecutiveFailures: 0,
  brainFaults: 0,
  unreadablePages: 0,
  stalledSteps: 0,
  operatorStopped: false,
  ...overrides,
});

describe('the rails', () => {
  it('[BRW-4] hold when nothing has tripped, and trip one at a time by declared order', () => {
    expect(checkRails(state(), RAIL_LIMITS, at(1))).toBeNull();
    expect(checkRails(state({ tasksSpent: 2 }), RAIL_LIMITS, at(1))?.reason).toBe('max-tasks');
    // Units started, or closed by an outcome that spends nothing, never trip the budget.
    expect(checkRails(state({ tasksStarted: 2, openTask: false }), RAIL_LIMITS, at(1))).toBeNull();
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
      tasksSpent: 9,
      consecutiveFailures: 9,
      brainFaults: 9,
    });
    expect(checkRails(everything, RAIL_LIMITS, at(99))?.reason).toBe('operator-stop');
    expect(checkRails(state({ tasksSpent: 2 }), RAIL_LIMITS, at(1))?.detail).toBe(
      '2 of 2 units of work closed done or failed, 0 started',
    );
  });

  it('[BRW-4] names only engine terminations, each with a status in the termination table: the target ends complete, every limit stopped', () => {
    for (const rail of RAILS) {
      expect(BROWSER_SESSION_TERMINATIONS).toContain(rail.reason);
      expect(TERMINATION_STATUS[rail.reason]).toBe(
        rail.reason === 'target-reached' ? 'complete' : 'stopped',
      );
    }
    expect(new Set(RAILS.map((rail) => rail.reason)).size).toBe(RAILS.length);
  });

  it("[BRW-4] ends the session complete once the target's units close done — counted on done alone, the goal before the limit, the operator before both", () => {
    const target = { ...RAIL_LIMITS, targetDone: 2 };
    expect(checkRails(state({ tasksDone: 1, tasksSpent: 1 }), target, at(1))).toBeNull();
    // The unit that reaches the target is also the budget's last: the goal is what is reported.
    const reached = checkRails(state({ tasksDone: 2, tasksSpent: 2 }), target, at(1));
    expect(reached?.reason).toBe('target-reached');
    expect(reached?.detail).toBe('2 of 2 units of work closed done');
    // A failed unit spends the budget and counts nothing toward the target.
    expect(checkRails(state({ tasksDone: 1, tasksSpent: 2 }), target, at(1))?.reason).toBe(
      'max-tasks',
    );
    // With no target set, done units only spend.
    expect(checkRails(state({ tasksDone: 1, tasksSpent: 1 }), RAIL_LIMITS, at(1))).toBeNull();
    // The operator's word still outranks it.
    expect(
      checkRails(state({ tasksDone: 2, tasksSpent: 2, operatorStopped: true }), target, at(1))
        ?.reason,
    ).toBe('operator-stop');
  });

  it('tells the next plan how many units of work may still be spent: the open unit is not subtracted', () => {
    expect(remainingTasks(state(), RAIL_LIMITS)).toBe(2);
    expect(remainingTasks(state({ tasksSpent: 1 }), RAIL_LIMITS)).toBe(1);
    expect(remainingTasks(state({ tasksSpent: 5 }), RAIL_LIMITS)).toBe(0);
    expect(remainingTasks(state({ tasksStarted: 1, openTask: true }), RAIL_LIMITS)).toBe(2);
  });

  it('[BRW-4] stops on a page that will not read, rather than spending the failure budget on plans written against nothing', () => {
    // The live shape: a results page the adapter could not read, observation
    // after observation. Before this rail the session asked the brain for a
    // plan each time, the critics faulted it for guessing, and it stopped
    // reporting `max-failures` — a true count of a misleading thing.
    expect(checkRails(state({ unreadablePages: 1 }), RAIL_LIMITS, at(1))).toBeNull();
    const stopped = checkRails(state({ unreadablePages: 2 }), RAIL_LIMITS, at(1));
    expect(stopped?.reason).toBe('page-unreadable');
    expect(stopped?.detail).toContain('2 observations in a row');
    // It yields to the rails declared before it.
    expect(
      checkRails(state({ unreadablePages: 2, operatorStopped: true }), RAIL_LIMITS, at(1))?.reason,
    ).toBe('operator-stop');
  });

  it('[BRW-4] stops on a page that has not changed across the declared observations, whatever the steps did and whatever the failure budget', () => {
    // Measured 2026-10-07: twenty consecutive failed steps on one unchanged
    // empty document, under an operator's failure budget of twenty; then
    // twelve observations of one landing page, each step a navigate that
    // ran clean and moved nothing, which a count of failed steps never saw.
    expect(checkRails(state({ stalledSteps: 1 }), RAIL_LIMITS, at(1))).toBeNull();
    const stalled = checkRails(state({ stalledSteps: 2 }), RAIL_LIMITS, at(1));
    expect(stalled?.reason).toBe('page-stalled');
    expect(stalled?.detail).toBe('2 observations in a row of a page that did not change, limit 2');
    // A high failure budget does not save it: the stall rail reads its own count.
    expect(
      checkRails(
        state({ stalledSteps: 2, consecutiveFailures: 2 }),
        { ...RAIL_LIMITS, maxConsecutiveFailures: 99 },
        at(1),
      )?.reason,
    ).toBe('page-stalled');
  });
});
