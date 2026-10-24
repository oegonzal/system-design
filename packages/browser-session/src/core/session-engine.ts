import {
  BROWSER_SESSION_PIPELINES,
  createWriteQueue,
  startPeriodic,
  type BrowserSessionStatus,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import {
  createEngineContext,
  type RunSessionOptions,
  type SessionCriteria,
  type SessionDeps,
} from './engine-context';
import {
  BrainFaulted,
  type BrowserAction,
  type DerivedRubric,
  type Termination,
  type Withdrawal,
} from './ports';
import { timeLimitOf } from './rails';
import { closeInterrupted, closeSession, warnOf } from './session-close';
import { rubricsFile } from './session-dump';
import { createSessionEvents, startedEvent } from './session-events';
import { createState, pushHistory, touchedBy } from './session-state';
import { step } from './step-flow';
import { resolveAdvisors } from './unit-advice';
import { SESSION_HEARTBEAT_EVERY_MS } from './write-queue';

/**
 * The session loop. It decides nothing of its own: every plan, every field
 * answer and every termination it acts on is a quality-loop run or
 * orchestration it started and read back, named by id on the decision row.
 * What the engine adds is declared — the rails in `rails.ts`, the routing
 * in the contracts' read-back — and the bookkeeping: rows through a chained
 * write queue that never stalls the browser, a heartbeat on its own timer,
 * step files into the dump as they come (`step-flow.ts`), what happened said
 * on the bus for whoever keeps a record beyond the session
 * (`session-events.ts`), and on every path out — a plan's cause, a rail, the
 * operator at the terminal or by Ctrl-C, a fault — the browser closed, the
 * queues drained, the session row closed and the dump indexed
 * (`session-close.ts`).
 */
export interface SessionOutcome {
  sessionId: string;
  dumpRunId: string;
  status: BrowserSessionStatus;
  termination: Termination;
  steps: number;
}

type Role = keyof SessionCriteria;
const ROLES = Object.keys(BROWSER_SESSION_PIPELINES) as Role[];

/** The rubric for every pipeline the session runs, once; a fault here ends the session before the browser opens. */
async function deriveRubrics(
  deps: SessionDeps,
  mission: string,
): Promise<Record<Role, DerivedRubric>> {
  const rubrics: Partial<Record<Role, DerivedRubric>> = {};
  for (const role of ROLES) {
    rubrics[role] = await deps.brain.deriveRubric(BROWSER_SESSION_PIPELINES[role], mission);
  }
  return rubrics as Record<Role, DerivedRubric>;
}

/** One record per pipeline the session runs, keyed by the pipeline's id. */
const byPipeline = <T>(of: (role: Role) => T): Record<string, T> =>
  Object.fromEntries(ROLES.map((role) => [BROWSER_SESSION_PIPELINES[role], of(role)]));

// BOOKMARK
/** What a question waiting on the operator is withdrawn with when the session is told to stop. */
export const STOPPING: Withdrawal = { reason: 'abandoned', note: 'the session is stopping' };

/** What a question waiting on the operator is withdrawn with when the session's time limit comes. */
export const OUT_OF_TIME: Withdrawal = { reason: 'abandoned', note: "the session's time is up" };

export async function runSession(
  deps: SessionDeps,
  options: RunSessionOptions,
): Promise<SessionOutcome> {
  const goal = await deps.goals.read(options.goalPath);
  const sessionId = crypto.randomUUID();
  // Every declared section parsed and every advisor the mission names resolved
  // and asked once, before a row, a beat or a dump folder exists: a malformed
  // mission or an advisor nobody runs refuses the session like a bad flag.
  const advisors = await resolveAdvisors(deps, goal.markdown, options, sessionId);
  const startedAt = deps.clock.now();
  await closeInterrupted(deps, startedAt);
  const dump = deps.dumps.open(startedAt);
  const state = createState({ sessionId, dumpRunId: dump.runId, startedAt });
  // The one awaited write: a ledger that refuses the row stops the session before the browser opens.
  await deps.ledger.openSession({
    id: state.sessionId,
    dumpRunId: dump.runId,
    goalPath: goal.path,
    goalHash: goal.hash,
    goalMarkdown: goal.markdown,
    profile: options.profile,
    subject: options.subject,
    headed: options.headed,
    limits: options.rails,
    startedAt,
  });
  const warn = warnOf(deps, state.sessionId);
  const queue = createWriteQueue((what, error) => warn(`${what} not recorded`, error));
  const events = createSessionEvents(deps.events, (what, error) =>
    warn(`${what} not published`, error),
  );
  events.publish(startedEvent({ state, options }));
  // Ctrl-C is the operator's word: the session ends after the step in flight,
  // through every closing write, instead of dying with a running row behind it
  // — and a question waiting on the operator is withdrawn at once, so a step
  // blocked on one ends too. Measured 2026-10-12: a session blocked on a
  // question asked on a remote channel could only be killed, and left its row
  // running.
  const stopping = new AbortController();
  const release = deps.stop.onStop(() => {
    if (!state.operatorStopped)
      deps.log(`session ${state.sessionId}: interrupted — ending after this step`);
    state.operatorStopped = true;
    stopping.abort(STOPPING);
  });
  // The rails read the time limit between steps, and a step waiting on the
  // operator has no between: when the limit comes, a question still open is
  // withdrawn as a stop withdraws one, and the rails then read the limit. The
  // operator pressed nothing, so the session ends max-minutes, never
  // operator-stop. Measured 2026-10-13: a session waited 40 minutes on an
  // unanswered question, and only an interrupt could have ended one past its
  // limit.
  const deadline = deps.clock.at(timeLimitOf(startedAt, options.rails), () =>
    stopping.abort(OUT_OF_TIME),
  );
  const ticker = startPeriodic(
    { everyMs: SESSION_HEARTBEAT_EVERY_MS, atStart: false },
    () => deps.ledger.heartbeat(state.sessionId, deps.clock.now(), state.step),
    (error) => warn('heartbeat not written', error),
  );
  const ctx = createEngineContext({
    deps,
    options,
    state,
    mission: goal.markdown,
    dump,
    queue,
    advisors,
    events,
    stopping: stopping.signal,
  });

  let termination: Termination = { reason: 'error', detail: 'the session ended before deciding' };
  let error: { name: string; message: string } | null = null;
  try {
    const rubrics = await deriveRubrics(deps, goal.markdown);
    ctx.criteria = Object.fromEntries(
      ROLES.map((role) => [role, rubrics[role].criteria]),
    ) as SessionCriteria;
    // Where each rubric was made: the loop dumped each derivation as a folder of its own.
    ctx.dumpFiles('rubrics', [rubricsFile(byPipeline((role) => rubrics[role]))]);
    queue.write('criteria', () =>
      deps.ledger.recordCriteria(
        state.sessionId,
        byPipeline((role) => ctx.criteria[role]),
      ),
    );
    await deps.browser.open(options.profile, { headed: options.headed });
    // Open where the work begins, so the loop never plans on about:blank — the
    // one reliably contentless page, where the judges read "no listings" as a
    // limit and gate the navigate that would leave it. Engine setup, not a
    // planned step: no decision row.
    if (options.startUrl !== undefined) {
      deps.log(`session ${state.sessionId}: opening at ${options.startUrl}`);
      const opening: BrowserAction = {
        kind: 'navigate',
        url: options.startUrl,
        reason: 'open at the start url',
        expect: null,
        serves: [],
      };
      await deps.browser.act(opening);
      // Told to the first plan as what led to its page, so it does not open it again.
      pushHistory(state, `navigate ${options.startUrl}`, 'ok', null);
      state.lastStep = { ran: 1, touched: touchedBy([opening], []), held: [] };
    }
    for (;;) {
      const decidedEnd = await step(ctx);
      if (decidedEnd !== null) {
        termination = state.terminationRecorded
          ? decidedEnd
          : ctx.terminate(decidedEnd, 'engine', null);
        break;
      }
    }
  } catch (caught) {
    if (caught instanceof BrainFaulted) {
      termination = { reason: 'brain-unavailable', detail: caught.message };
    } else {
      const described = describeError(caught);
      error = { name: described.name, message: described.message };
      termination = { reason: 'error', detail: described.message };
    }
    if (!state.terminationRecorded) ctx.terminate(termination, 'engine', null);
  } finally {
    release();
    deadline();
    // A beat in flight is let finish before the session's closing writes.
    await ticker.stop();
    await deps.browser.close().catch((caught: unknown) => warn('browser not closed', caught));
  }
  return closeSession(ctx, { goal, startedAt, termination, error });
}
