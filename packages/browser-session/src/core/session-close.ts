import { MISSION_STOP, TERMINATION_STATUS } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { EngineContext, SessionDeps } from './engine-context';
import type { GoalSource, Termination } from './ports';
import { closingFiles, dumpedTasks, indexRowOf, manifestOf } from './session-dump';
import type { SessionOutcome } from './session-engine';
import { endedEvent } from './session-events';
import { tasksClosed } from './session-state';

/** A write that did not land, a beat that was missed: reported under the session, never thrown. */
export const warnOf =
  (deps: SessionDeps, sessionId: string) =>
  (what: string, error: unknown): void =>
    deps.warn(`session ${sessionId}: ${what} — ${describeError(error).message}`);

/**
 * Every session another process left running and then stopped beating for —
 * killed, crashed, the machine put to sleep — closed as interrupted by the
 * session that starts now, as the quality loop's janitor closes a run whose
 * beat stopped. Only a session silent past the declared stale window is
 * closed, so one alive beside this one is never touched. Housekeeping, not
 * the session's own record: a ledger that cannot do it is one warning.
 */
export async function closeInterrupted(
  deps: SessionDeps,
  now: Date,
  staleAfterMs: number,
): Promise<void> {
  try {
    const closed = await deps.ledger.failStale(new Date(now.getTime() - staleAfterMs));
    if (closed > 0) {
      deps.log(`closed ${closed} session(s) that stopped beating without closing, as interrupted`);
    }
  } catch (error) {
    deps.warn(`sessions that stopped beating were not closed — ${describeError(error).message}`);
  }
}

/** How a session ended: the termination decided, the fault if one was thrown, and when. */
export interface SessionEnd {
  goal: Awaited<ReturnType<GoalSource['read']>>;
  startedAt: Date;
  termination: Termination;
  error: { name: string; message: string } | null;
}

/**
 * Every path out of a session — a plan's cause, a rail, the operator, a
 * fault — ends here: the end said on the bus, the queue drained, the session
 * row closed, the events waited for one window in all, the dump closed and
 * indexed, the outcome logged and returned. A close that fails is reported,
 * never thrown: what the session did is already on the record.
 */
export async function closeSession(ctx: EngineContext, end: SessionEnd): Promise<SessionOutcome> {
  const { deps, options, state, dump, queue, events } = ctx;
  const warn = warnOf(deps, state.sessionId);
  const finishedAt = deps.clock.now();
  // Whoever keeps the record learns the session is over before anything else closes.
  events.publish(endedEvent(state.sessionId));
  // A stop the mission declares leaves the session in the status the mission
  // gave it; every other end is the engine's, classified where it is declared.
  const status =
    end.termination.reason === MISSION_STOP
      ? end.termination.ending
      : TERMINATION_STATUS[end.termination.reason];
  await queue.drain();
  try {
    await deps.ledger.closeSession(state.sessionId, {
      status,
      termination: end.termination,
      steps: state.step,
      finishedAt,
      error: end.error,
    });
  } catch (caught) {
    warn('session row not closed', caught);
  }
  // The events ride their own queue: one window for them all, and what is
  // still unsent is said and recorded, never waited on for good.
  const unsentEvents = await events.drain(options.eventsDrainMs);
  if (unsentEvents.length > 0) {
    deps.warn(
      `session ${state.sessionId}: ${unsentEvents.length} event(s) not published within ${options.eventsDrainMs} ms — ${unsentEvents.join(', ')}`,
    );
  }
  try {
    const manifest = manifestOf({
      dumpRunId: dump.runId,
      sessionId: state.sessionId,
      goalPath: end.goal.path,
      goalHash: end.goal.hash,
      profile: options.profile,
      headed: options.headed,
      status,
      termination: end.termination,
      limits: options.rails,
      settings: options.settingsSources,
      steps: state.step,
      tasks: { started: state.tasks.started, closed: tasksClosed(state) },
      decisions: state.decisions,
      startedAt: end.startedAt,
      finishedAt,
      error: end.error,
      unsentEvents,
    });
    const rows = (await deps.ledger.getSession(state.sessionId))?.tasks ?? [];
    dump.write(closingFiles(manifest, end.goal.markdown, dumpedTasks(rows, state.tasks.contexts)));
    dump.index(indexRowOf(manifest));
  } catch (caught) {
    warn('dump not closed', caught);
  }
  deps.log(
    `session ${state.sessionId}: ${status} — ${end.termination.reason}: ${end.termination.detail}`,
  );
  return {
    sessionId: state.sessionId,
    dumpRunId: dump.runId,
    status,
    termination: end.termination,
    steps: state.step,
  };
}
