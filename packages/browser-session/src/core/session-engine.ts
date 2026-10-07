import {
  BROWSER_SESSION_PIPELINES,
  type BrowserSessionStatus,
  observationFingerprint,
  type PageObservation,
  type PlanReadout,
  routePlan,
  SETTLING_CRITERION_KINDS,
  type StepPlan,
  TERMINATION_STATUS,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type {
  EngineContext,
  RunSessionOptions,
  SessionCriteria,
  SessionDeps,
} from './engine-context';
import { checkExact, unmetNote } from './expectations';
import { BrainFaulted, type Decided, type Termination } from './ports';
import { checkRails } from './rails';
import {
  closingFiles,
  indexRowOf,
  manifestOf,
  observationFiles,
  stepJsonFile,
} from './session-dump';
import {
  createState,
  describeRefusedPlan,
  ledgerSummaryOf,
  noteObservation,
  progressOf,
  pushHistory,
  pushObjections,
  railStateOf,
  tasksClosed,
} from './session-state';
import { executeActions } from './step-executor';
import { createWriteQueue, heartbeatTicker, SESSION_HEARTBEAT_EVERY_MS } from './write-queue';

/**
 * The session loop. It decides nothing of its own: every plan, every field
 * answer and every termination it acts on is a quality-loop run or
 * orchestration it started and read back, named by id on the decision row.
 * What the engine adds is declared — the rails in `rails.ts`, the routing
 * in the contracts' read-back — and the bookkeeping: rows through a chained
 * write queue that never stalls the browser, a heartbeat on its own timer,
 * step files into the dump as they come, and on every path out — a plan's
 * cause, a rail, the operator, a fault — the browser closed, the queue
 * drained, the session row closed and the dump indexed.
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

/** The previous step's promise, held against this page: only an exact check that fails is counted. */
function settleExpectation(ctx: EngineContext, observation: PageObservation): void {
  const { state } = ctx;
  const pending = state.pending;
  state.pending = null;
  if (pending === null || pending.check === null) return;
  if (checkExact(pending.check, observation)) return;
  pushHistory(state, pending.action, 'failed', unmetNote(pending));
  ctx.fail('expectation-unmet');
}

/** Who objected when nothing named a finding or a problem: the controller's own reason. */
const CONTROLLER = 'controller';

const planPayload = (readout: PlanReadout, decided: Decided<StepPlan>) => ({
  pageKind: readout.plan?.pageKind ?? null,
  assessment: readout.plan?.assessment ?? null,
  actions: readout.plan?.actions.length ?? 0,
  executable: readout.executable,
  executePrefix: readout.executePrefix,
  reason: readout.reason,
  objections: readout.objections,
  finalDecision: decided.run.trace?.finalDecision ?? null,
  composition: decided.composition,
});

/** One page: observe, plan through the loop, read the plan back, run what nobody objected to, check the rails. */
async function step(ctx: EngineContext): Promise<Termination | null> {
  const { deps, state, options } = ctx;
  state.step += 1;
  state.ordinal = 0;
  state.teachings = [];
  const observation = await deps.browser.observe();
  const screenshot = await deps.browser.screenshot().catch(() => null);
  noteObservation(state, observationFingerprint(observation));
  settleExpectation(ctx, observation);
  ctx.dumpFiles('step files', observationFiles(state.step, observation, screenshot));

  // A read that did not reach the page is counted, and one that did clears the
  // count. The rails are then checked before the brain is asked for anything:
  // a page that will not read is not a plan anybody can write, and a session
  // out of time or units of work should not spend another run finding out.
  state.unreadablePages = observation.unread === null ? 0 : state.unreadablePages + 1;
  const railed = checkRails(railStateOf(state), options.rails, deps.clock.now());
  if (railed !== null) return railed;

  const startedAt = deps.clock.now();
  let decided: Decided<StepPlan>;
  try {
    decided = await deps.brain.planStep({
      mission: ctx.mission,
      observation,
      history: [...state.history],
      ledger: ledgerSummaryOf(state, options.rails),
      objections: [...state.objections],
      criteria: ctx.criteria.plan,
      pageUnchanged: state.pageUnchanged,
      nothingRan: state.step > 1 && state.lastRan === 0,
      progress: progressOf(state),
    });
  } catch (error) {
    if (!(error instanceof BrainFaulted)) throw error;
    state.brainFaults += 1;
    const durationMs = deps.clock.now().getTime() - startedAt.getTime();
    ctx.record({
      kind: 'step-plan',
      source: 'engine',
      loopRunId: null,
      loopOrchestrationId: null,
      ref: null,
      question: null,
      answer: null,
      confidence: null,
      durationMs,
      payload: { fault: error.reason, message: error.message },
    });
    ctx.dumpFiles('fault', [
      stepJsonFile(state.step, 'fault', { reason: error.reason, message: error.message }),
    ]);
    pushHistory(state, 'plan', 'failed', `brain ${error.reason}: ${error.message}`);
    state.lastRan = 0;
    deps.warn(`step ${state.step}: no plan — ${error.message}`);
    return checkRails(railStateOf(state), options.rails, deps.clock.now());
  }
  const durationMs = deps.clock.now().getTime() - startedAt.getTime();
  const readout = routePlan(decided.run, state.step);
  // Whatever objected is recorded once, whether or not the plan runs: a plan
  // cut short owes the next producer the reasons as much as a refused one.
  pushObjections(
    state,
    readout.objections.length > 0
      ? readout.objections
      : readout.reason === null
        ? []
        : [{ step: state.step, from: CONTROLLER, at: [], detail: readout.reason }],
  );
  ctx.record({
    kind: 'step-plan',
    source: 'loop',
    loopRunId: decided.runId,
    loopOrchestrationId: decided.orchestrationRunId,
    ref: null,
    question: null,
    answer: null,
    confidence: null,
    durationMs,
    payload: planPayload(readout, decided),
  });
  ctx.dumpFiles('plan', [
    stepJsonFile(state.step, 'plan', {
      runId: decided.runId,
      composition: decided.composition,
      readout: { ...readout, plan: undefined },
      plan: readout.plan,
    }),
  ]);
  deps.log(
    `step ${state.step}: ${readout.plan?.pageKind ?? 'no plan'} — ${
      readout.executable
        ? `${readout.executePrefix} action(s) to run`
        : `not executed: ${readout.reason}`
    } (run ${decided.runId})`,
  );

  if (!readout.executable || readout.plan === null) {
    // One entry for the plan, not one per action it proposed. Measured on
    // 2026-10-07: a refused six-action plan wrote six not-executed entries, two
    // refusals filled HISTORY_MAX, and the producer read its own refused
    // proposals — "terminate limit-reached" among them — as the session's
    // recent past. The actions themselves stay whole in the step's plan.json,
    // and why it did not run is an objection, carried once.
    pushHistory(state, describeRefusedPlan(readout.plan), 'not-executed', null);
    state.lastRan = 0;
    ctx.fail('plan-not-executed');
    return checkRails(railStateOf(state), options.rails, deps.clock.now());
  }
  const openBefore = state.tasks.open !== null;
  const executed = await executeActions(
    ctx,
    decided,
    { ...readout, plan: readout.plan },
    observation,
  );
  if (executed.termination !== null) return executed.termination;
  state.lastRan = executed.ranOk;
  // What the evaluator passed waits for the next observation: settled, if the
  // page moved, for the unit when one was open before or after the plan, else
  // for the session — every pass when the plan ran whole, else the passes an
  // action that ran said it served. A plan that closed its unit settles
  // nothing: what it passed was that unit's, and the unit is gone.
  const openAfter = state.tasks.open !== null;
  const scope = openBefore || openAfter ? 'unit' : 'session';
  if (!(openBefore && !openAfter)) {
    const settling = new Set(
      ctx.criteria.plan
        .filter((criterion) =>
          (SETTLING_CRITERION_KINDS as readonly string[]).includes(criterion.kind),
        )
        .map((criterion) => criterion.id),
    );
    const served = new Set(
      readout.plan.actions.slice(0, executed.ranOk).flatMap((action) => action.serves),
    );
    const ids = readout.passed.filter(
      (id) => settling.has(id) && (executed.ranWhole || served.has(id)),
    );
    state.pendingPass = ids.length === 0 ? null : { ids, scope };
  }
  return checkRails(railStateOf(state), options.rails, deps.clock.now());
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
  const warn = (what: string, error: unknown): void =>
    deps.warn(`session ${state.sessionId}: ${what} — ${describeError(error).message}`);
  const queue = createWriteQueue((what, error) => warn(`${what} not recorded`, error));
  const ticker = heartbeatTicker(
    () => deps.ledger.heartbeat(state.sessionId, deps.clock.now(), state.step),
    SESSION_HEARTBEAT_EVERY_MS,
    (error) => warn('heartbeat not written', error),
  );
  const ctx: EngineContext = {
    deps,
    options,
    state,
    mission: goal.markdown,
    criteria: { plan: [], answer: [] },
    queue,
    dump,
    record(decision) {
      state.ordinal += 1;
      state.decisions += 1;
      const row = {
        ...decision,
        id: crypto.randomUUID(),
        sessionId: state.sessionId,
        taskId: state.tasks.open?.id ?? null,
        step: state.step,
        ordinal: state.ordinal,
        createdAt: deps.clock.now(),
      };
      queue.write(`decision ${row.step}.${row.ordinal}`, () => deps.ledger.recordDecision(row));
      return row.id;
    },
    dumpFiles(what, files) {
      queue.write(`dump ${what}`, async () => dump.write(files));
    },
    fail(event) {
      state.consecutiveFailures += 1;
      deps.log(`step ${state.step}: ${event} (${state.consecutiveFailures} in a row)`);
    },
    terminate(termination, source, runId) {
      ctx.record({
        kind: 'termination',
        source,
        loopRunId: runId,
        loopOrchestrationId: null,
        ref: null,
        question: null,
        answer: null,
        confidence: null,
        durationMs: null,
        payload: { reason: termination.reason, detail: termination.detail },
      });
      state.terminationRecorded = true;
      return termination;
    },
  };

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

  const finishedAt = deps.clock.now();
  const status = TERMINATION_STATUS[termination.reason];
  await queue.drain();
  try {
    await deps.ledger.closeSession(state.sessionId, {
      status,
      termination,
      steps: state.step,
      finishedAt,
      error,
    });
  } catch (caught) {
    warn('session row not closed', caught);
  }
  try {
    const manifest = manifestOf({
      dumpRunId: dump.runId,
      sessionId: state.sessionId,
      goalPath: goal.path,
      goalHash: goal.hash,
      profile: options.profile,
      headed: options.headed,
      status,
      termination,
      limits: options.rails,
      steps: state.step,
      tasks: { started: state.tasks.started, closed: tasksClosed(state) },
      decisions: state.decisions,
      startedAt,
      finishedAt,
      error,
    });
    const tasks = (await deps.ledger.getSession(state.sessionId))?.tasks ?? [];
    dump.write(closingFiles(manifest, goal.markdown, tasks));
    dump.index(indexRowOf(manifest));
  } catch (caught) {
    warn('dump not closed', caught);
  }
  deps.log(`session ${state.sessionId}: ${status} — ${termination.reason}: ${termination.detail}`);
  return {
    sessionId: state.sessionId,
    dumpRunId: dump.runId,
    status,
    termination,
    steps: state.step,
  };
}
