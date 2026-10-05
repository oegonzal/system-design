import type { SessionRailsDto } from '@sysdesign/contracts';

import type { Termination } from './ports';

/**
 * The engine's own stop rules — the only decisions it takes without a run.
 * Each is a declared predicate over counted state, checked in declared order
 * after every step; the first that holds ends the session with its reason
 * and the number that tripped it. Nothing here reads a page.
 */
export interface RailState {
  startedAt: Date;
  /** Units of work opened and closed so far. */
  tasksStarted: number;
  tasksClosed: number;
  openTask: boolean;
  consecutiveFailures: number;
  brainFaults: number;
  /** Observations in a row the adapter could not read the page from. */
  unreadablePages: number;
  operatorStopped: boolean;
}

/** What a step can do to the failure count: these are the only events that move it. */
export const STEP_FAILURE_EVENTS = [
  'action-failed',
  'expectation-unmet',
  'plan-not-executed',
] as const;
export type StepFailureEvent = (typeof STEP_FAILURE_EVENTS)[number];

interface Rail {
  reason: Termination['reason'];
  holds(state: RailState, rails: SessionRailsDto, now: Date): boolean;
  detail(state: RailState, rails: SessionRailsDto, now: Date): string;
}

const minutesSince = (startedAt: Date, now: Date): number =>
  (now.getTime() - startedAt.getTime()) / 60_000;

/** In the order they are checked: the operator's word first, then the session's own limits. */
export const RAILS: readonly Rail[] = [
  {
    reason: 'operator-stop',
    holds: (state) => state.operatorStopped,
    detail: () => 'the operator typed /stop',
  },
  {
    reason: 'max-tasks',
    holds: (state, rails) =>
      state.tasksClosed >= rails.maxTasks ||
      (!state.openTask && state.tasksStarted >= rails.maxTasks),
    detail: (state, rails) =>
      `${state.tasksClosed} of ${rails.maxTasks} units of work closed, ${state.tasksStarted} started`,
  },
  {
    reason: 'max-minutes',
    holds: (state, rails, now) => minutesSince(state.startedAt, now) >= rails.maxMinutes,
    detail: (state, rails, now) =>
      `${minutesSince(state.startedAt, now).toFixed(1)} of ${rails.maxMinutes} minutes elapsed`,
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
    detail: (state, rails) => `${state.brainFaults} brain faults, limit ${rails.maxBrainFaults}`,
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

/** Units of work the session may still open under its rail — the rail is always set, so never null here. */
export const remainingTasks = (state: RailState, rails: SessionRailsDto): number =>
  Math.max(0, rails.maxTasks - state.tasksStarted);
