import { MISSION_STOP, TERMINATION_STATUS } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { EngineContext, SessionDeps } from './engine-context';
import type { GoalSource, Termination } from './ports';
import { closingFiles, indexRowOf, manifestOf } from './session-dump';
import type { SessionOutcome } from './session-engine';
import { tasksClosed } from './session-state';

/** A write that did not land, a beat that was missed: reported under the session, never thrown. */
export const warnOf =
  (deps: SessionDeps, sessionId: string) =>
  (what: string, error: unknown): void =>
    deps.warn(`session ${sessionId}: ${what} — ${describeError(error).message}`);

/** How a session ended: the termination decided, the fault if one was thrown, and when. */
export interface SessionEnd {
  goal: Awaited<ReturnType<GoalSource['read']>>;
  startedAt: Date;
  termination: Termination;
  error: { name: string; message: string } | null;
}

/**
 * Every path out of a session — a plan's cause, a rail, the operator, a
 * fault — ends here: the queue drained, the session row closed, the dump
 * closed and indexed, the outcome logged and returned. A close that fails is
 * reported, never thrown: what the session did is already on the record.
 */
export async function closeSession(ctx: EngineContext, end: SessionEnd): Promise<SessionOutcome> {
  const { deps, options, state, dump, queue } = ctx;
  const warn = warnOf(deps, state.sessionId);
  const finishedAt = deps.clock.now();
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
      steps: state.step,
      tasks: { started: state.tasks.started, closed: tasksClosed(state) },
      decisions: state.decisions,
      startedAt: end.startedAt,
      finishedAt,
      error: end.error,
    });
    const tasks = (await deps.ledger.getSession(state.sessionId))?.tasks ?? [];
    dump.write(closingFiles(manifest, end.goal.markdown, tasks));
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
