import {
  TOOL_SESSION_RAIL_STATUS,
  type ToolSessionEnding,
  type ToolSessionRail,
} from '@sysdesign/contracts';

import type { RailsSettings } from '../settings';

/** What the session counts in a row, each cleared by the opposite event. */
export interface RailCounters {
  /** Plans refused or that ran nothing. */
  refusals: number;
  /** Calls that failed or were refused. */
  failedCalls: number;
  /** Loop calls that answered nothing usable. */
  brainFaults: number;
}

export const freshCounters = (): RailCounters => ({ refusals: 0, failedCalls: 0, brainFaults: 0 });

/** The first rail the state trips, before the step is taken, or null when none does. */
export function trippedRail(
  counters: RailCounters,
  rails: RailsSettings,
  step: number,
  elapsedMs: number,
): ToolSessionRail | null {
  if (step > rails.maxSteps) return 'step-limit';
  if (elapsedMs > rails.maxMinutes * 60_000) return 'time-limit';
  if (counters.brainFaults >= rails.maxBrainFaults) return 'loop-faulted';
  if (counters.refusals >= rails.maxConsecutiveRefusals) return 'stalled';
  if (counters.failedCalls >= rails.maxFailedCalls) return 'tools-failing';
  return null;
}

/** How a rail ends the session: its cause word, what tripped it, and the status its table declares. */
export const railEnding = (rail: ToolSessionRail, detail: string): ToolSessionEnding => ({
  cause: rail,
  detail,
  status: TOOL_SESSION_RAIL_STATUS[rail],
});

/** What each rail says of itself when it trips. */
export function railDetail(
  rail: ToolSessionRail,
  counters: RailCounters,
  rails: RailsSettings,
): string {
  switch (rail) {
    case 'step-limit':
      return `${rails.maxSteps} steps taken`;
    case 'time-limit':
      return `${rails.maxMinutes} minutes elapsed`;
    case 'loop-faulted':
      return `${counters.brainFaults} loop calls in a row answered nothing usable`;
    case 'stalled':
      return `${counters.refusals} plans in a row were refused or ran nothing`;
    case 'tools-failing':
      return `${counters.failedCalls} calls in a row failed or were refused`;
    case 'operator-unavailable':
    case 'stop-signal':
    case 'error':
      return rail;
  }
}
