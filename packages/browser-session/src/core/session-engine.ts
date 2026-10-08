import { BROWSER_SESSION_PIPELINES, type BrowserSessionStatus } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import {
  createEngineContext,
  type RunSessionOptions,
  type SessionCriteria,
  type SessionDeps,
} from './engine-context';
import { BrainFaulted, type Termination } from './ports';
import { closeSession, warnOf } from './session-close';
import { createState } from './session-state';
import { step } from './step-flow';
import { createWriteQueue, heartbeatTicker, SESSION_HEARTBEAT_EVERY_MS } from './write-queue';

/**
 * The session loop. It decides nothing of its own: every plan, every field
 * answer and every termination it acts on is a quality-loop run or
 * orchestration it started and read back, named by id on the decision row.
 * What the engine adds is declared — the rails in `rails.ts`, the routing
 * in the contracts' read-back — and the bookkeeping: rows through a chained
 * write queue that never stalls the browser, a heartbeat on its own timer,
 * step files into the dump as they come (`step-flow.ts`), and on every path
 * out — a plan's cause, a rail, the operator, a fault — the browser closed,
 * the queue drained, the session row closed and the dump indexed
 * (`session-close.ts`).
 */
export interface SessionOutcome {
  sessionId: string;
  dumpRunId: string;
  status: BrowserSessionStatus;
  termination: Termination;
  steps: number;
}

/** The rubric for both pipelines, once; a fault here ends the session before the browser opens. */
async function deriveRubrics(deps: SessionDeps, mission: string): Promise<SessionCriteria> {
  return {
    plan: await deps.brain.deriveRubric(BROWSER_SESSION_PIPELINES.plan, mission),
    answer: await deps.brain.deriveRubric(BROWSER_SESSION_PIPELINES.answer, mission),
  };
}

export async function runSession(
  deps: SessionDeps,
  options: RunSessionOptions,
): Promise<SessionOutcome> {
  const goal = await deps.goals.read(options.goalPath);
  const startedAt = deps.clock.now();
  const dump = deps.dumps.open(startedAt);
  const state = createState({ sessionId: crypto.randomUUID(), dumpRunId: dump.runId, startedAt });
  // The one awaited write: a ledger that refuses the row stops the session before the browser opens.
  await deps.ledger.openSession({
    id: state.sessionId,
    dumpRunId: dump.runId,
    goalPath: goal.path,
    goalHash: goal.hash,
    goalMarkdown: goal.markdown,
    profile: options.profile,
    headed: options.headed,
    limits: options.rails,
    startedAt,
  });
  const warn = warnOf(deps, state.sessionId);
  const queue = createWriteQueue((what, error) => warn(`${what} not recorded`, error));
  const ticker = heartbeatTicker(
    () => deps.ledger.heartbeat(state.sessionId, deps.clock.now(), state.step),
    SESSION_HEARTBEAT_EVERY_MS,
    (error) => warn('heartbeat not written', error),
  );
  const ctx = createEngineContext({ deps, options, state, mission: goal.markdown, dump, queue });

  let termination: Termination = { reason: 'error', detail: 'the session ended before deciding' };
  let error: { name: string; message: string } | null = null;
  try {
    ctx.criteria = await deriveRubrics(deps, goal.markdown);
    queue.write('criteria', () =>
      deps.ledger.recordCriteria(state.sessionId, {
        [BROWSER_SESSION_PIPELINES.plan]: ctx.criteria.plan,
        [BROWSER_SESSION_PIPELINES.answer]: ctx.criteria.answer,
      }),
    );
    await deps.browser.open(options.profile, { headed: options.headed });
    // Open where the work begins, so the loop never plans on about:blank — the
    // one reliably contentless page, where the judges read "no listings" as a
    // limit and gate the navigate that would leave it. Engine setup, not a
    // planned step: no decision row.
    if (options.startUrl !== undefined) {
      deps.log(`session ${state.sessionId}: opening at ${options.startUrl}`);
      await deps.browser.act({
        kind: 'navigate',
        url: options.startUrl,
        reason: 'open at the start url',
        expect: null,
        serves: [],
      });
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
    ticker.stop();
    await deps.browser.close().catch((caught: unknown) => warn('browser not closed', caught));
  }
  return closeSession(ctx, { goal, startedAt, termination, error });
}
