import {
  SPENDING_TASK_OUTCOMES,
  type EngineTermination,
  type SessionRailsDto,
} from '@sysdesign/contracts';

import type { Termination } from './ports';

/**
 * The engine's own stop rules — the only decisions it takes without a run.
 * Each is a declared predicate over counted state, checked in declared order
 * after every step; the first that holds ends the session with its reason
 * and the number that tripped it. Nothing here reads a page.
 */
export interface RailState {
  startedAt: Date;
  /** Units of work opened so far. */
  tasksStarted: number;
  /** Units of work closed `done`: what the session's target counts. */
  tasksDone: number;
  /** Units of work closed by an outcome that spends the budget — worked to their end, however they ended. */
  tasksSpent: number;
  openTask: boolean;
  consecutiveFailures: number;
  /** Brain calls in a row that answered nothing; an answered one clears it. */
  brainFaults: number;
  /** Observations in a row the adapter could not read the page from. */
  unreadablePages: number;
  /** Observations in a row of a page that did not change, whatever the steps between them did. */
  stalledSteps: number;
  operatorStopped: boolean;
}

/** What a step can do to the failure count: these are the only events that move it. */
export type StepFailureEvent =
  | 'action-failed'
  | 'expectation-unmet'
  | 'plan-not-executed'
  /** A taskStart the session refused against the record it was composed with: no unit opened, and the plan stopped there. */
  | 'unit-refused';

interface Rail {
  /** A rail is the engine's own: it never ends a session as the mission's stop. */
  reason: EngineTermination;
  holds(state: RailState, rails: SessionRailsDto, now: Date): boolean;
  detail(state: RailState, rails: SessionRailsDto, now: Date): string;
}

const MS_PER_MINUTE = 60_000;

const minutesSince = (startedAt: Date, now: Date): number =>
  (now.getTime() - startedAt.getTime()) / MS_PER_MINUTE;

type TimeRails = Pick<SessionRailsDto, 'maxMinutes' | 'unitGraceMinutes'>;

/** Minutes the session may run: its limit, and while a unit of work is open, the grace that unit may finish within. */
const minutesAllowed = (openTask: boolean, rails: TimeRails): number =>
  rails.maxMinutes + (openTask ? rails.unitGraceMinutes : 0);

/** The moment the session's time is up: its limit with no unit of work open, the end of the grace with one. */
export const timeLimitOf = (startedAt: Date, openTask: boolean, rails: TimeRails): Date =>
  new Date(startedAt.getTime() + minutesAllowed(openTask, rails) * MS_PER_MINUTE);

/** Whether the session's time is up as it stands: no unit of work starts then, and the `max-minutes` rail holds. */
export const timeIsUp = (
  state: Pick<RailState, 'startedAt' | 'openTask'>,
  rails: TimeRails,
  now: Date,
): boolean => now.getTime() >= timeLimitOf(state.startedAt, state.openTask, rails).getTime();

/** The longest a session may run — its limit and the grace of a unit open at it: the lifetime its events declare. */
export const lifetimeMinutesOf = (rails: TimeRails): number => minutesAllowed(true, rails);

/** What the grace had to do with a stop on time: nothing at 0, else whether a unit was open. */
const graceNote = (state: Pick<RailState, 'openTask'>, rails: TimeRails): string =>
  rails.unitGraceMinutes === 0
    ? ''
    : state.openTask
      ? `, past the ${rails.unitGraceMinutes}-minute grace of the unit of work still open`
      : ', no unit of work open';

/** In the order they are checked: the operator's word first, then the session's own limits. */
export const RAILS: readonly Rail[] = [
  {
    reason: 'operator-stop',
    holds: (state) => state.operatorStopped,
    detail: () => 'the operator ended the session: /stop, or Ctrl-C at the terminal',
  },
  {
    // The session's goal, checked before its limits: when the unit that
    // reaches the target is also the budget's last, the session reports the
    // goal. Only `done` counts — a unit found already done was done before
    // this session, and one set aside or failed was not done at all.
    reason: 'target-reached',
    holds: (state, rails) => rails.targetDone !== null && state.tasksDone >= rails.targetDone,
    detail: (state, rails) => `${state.tasksDone} of ${rails.targetDone} units of work closed done`,
  },
  {
    // The budget is spent by units worked to their end, however they ended; a
    // unit the site reported finished before, or set aside unworked, spends
    // none (`TASK_OUTCOME_SPENDS`). A session that keeps setting listings aside
    // moves the page each time, so the stall rail never sees it: `max-minutes`
    // is its bound.
    reason: 'max-tasks',
    holds: (state, rails) => state.tasksSpent >= rails.maxTasks,
    detail: (state, rails) =>
      `${state.tasksSpent} of ${rails.maxTasks} units of work closed ${SPENDING_TASK_OUTCOMES.join(' or ')}, ${state.tasksStarted} started`,
  },
  {
    // A backstop, never a budget: no unit starts once the limit has passed,
    // and a unit open then may finish within the declared grace — abandoned,
    // the record would avoid it as if it had been sent.
    reason: 'max-minutes',
    holds: timeIsUp,
    detail: (state, rails, now) =>
      `${minutesSince(state.startedAt, now).toFixed(1)} of ${rails.maxMinutes} minutes elapsed${graceNote(state, rails)}`,
  },
  {
    reason: 'max-failures',
    holds: (state, rails) => state.consecutiveFailures >= rails.maxConsecutiveFailures,
    detail: (state, rails) =>
      `${state.consecutiveFailures} consecutive failed steps, limit ${rails.maxConsecutiveFailures}`,
  },
  {
    reason: 'brain-unavailable',
    holds: (state, rails) => state.brainFaults >= rails.maxBrainFaults,
    detail: (state, rails) =>
      `${state.brainFaults} brain faults in a row, limit ${rails.maxBrainFaults}`,
  },
  {
    // A page that will not read is not a plan the brain can be asked for. The
    // session re-observes rather than guessing, and stops saying so rather
    // than spending its failure budget on plans against nothing.
    reason: 'page-unreadable',
    holds: (state, rails) => state.unreadablePages >= rails.maxUnreadablePages,
    detail: (state, rails) =>
      `${state.unreadablePages} observations in a row the page could not be read, limit ${rails.maxUnreadablePages}`,
  },
  {
    // A hand-back re-observes because a fresh observation beats a blind
    // revise. When the page has not changed, there is no fresh observation to
    // have: the same plan is being asked of the same page, and the failure
    // budget — which an operator may set high for a flaky page — is the wrong
    // rail to spend on it. A step that ran and moved nothing is the same
    // stall as one that was refused (measured 2026-10-07: twelve reloads of
    // one page, each counted a success). Read from the observation's own
    // identity, never from a URL or a page kind.
    reason: 'page-stalled',
    holds: (state, rails) => state.stalledSteps >= rails.maxStalledSteps,
    detail: (state, rails) =>
      `${state.stalledSteps} observations in a row of a page that did not change, limit ${rails.maxStalledSteps}`,
  },
];

/** The first rail that holds, or null when the session may go on. */
export function checkRails(
  state: RailState,
  rails: SessionRailsDto,
  now: Date,
): Termination | null {
  const tripped = RAILS.find((rail) => rail.holds(state, rails, now));
  return tripped === undefined
    ? null
    : { reason: tripped.reason, detail: tripped.detail(state, rails, now) };
}

/**
 * Units of work the session may still spend under its rail — the rail is
 * always set, so never null here. The open unit is not subtracted: whether it
 * spends is known only when it closes, and telling the planner it may start
 * nothing while an already-applied listing was open is what froze a session
 * on 2026-10-07.
 */
export const remainingTasks = (state: RailState, rails: SessionRailsDto): number =>
  Math.max(0, rails.maxTasks - state.tasksSpent);
