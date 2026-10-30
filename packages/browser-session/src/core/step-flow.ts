import {
  ENGINE_OBJECTORS,
  observationFingerprint,
  type PageObservation,
  type PlanReadout,
  routePlan,
  SETTLING_CRITERION_KINDS,
  type StepPlan,
  type UnitsOnRecord,
} from '@sysdesign/contracts';

import {
  CLOSING_PAGES,
  describeClosedPages,
  describeRefusedPlan,
  NOTHING_RAN,
} from './action-words';
import type { EngineContext } from './engine-context';
import { checkExact, unmetNote } from './expectations';
import {
  ActionFailed,
  BrainFaulted,
  type Decided,
  type PagesClosed,
  type Termination,
} from './ports';
import { checkRails } from './rails';
import { observationFiles, stepJsonFile } from './session-dump';
import {
  ledgerSummaryOf,
  noteObservation,
  progressOf,
  pushHistory,
  pushObjections,
  railStateOf,
  tasksClosed,
} from './session-state';
import { executeActions, type Executed } from './step-executor';
import { adviceSummary, recallAdvice, type AdviceRecord } from './unit-advice';

/**
 * One page of the session: observe it, ask the loop for a plan, read the plan
 * back, run what nobody objected to, and check the rails. Each step here is
 * one of those, and the engine decides nothing of its own along the way.
 */

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

const planPayload = (readout: PlanReadout, decided: Decided<StepPlan>, advice: AdviceRecord) => ({
  assessment: readout.plan?.assessment ?? null,
  actions: readout.plan?.actions.length ?? 0,
  executable: readout.executable,
  executePrefix: readout.executePrefix,
  reason: readout.reason,
  objections: readout.objections,
  finalDecision: decided.run.trace?.finalDecision ?? null,
  composition: decided.composition,
  advice: adviceSummary(advice),
});

/** The rails, checked where every path out of a step checks them. */
const rails = (ctx: EngineContext): Termination | null =>
  checkRails(railStateOf(ctx.state), ctx.options.rails, ctx.deps.clock.now());

/** A new step: the page as it is, its screenshot, the last step's promise settled, the files into the dump. */
async function observe(ctx: EngineContext): Promise<PageObservation> {
  const { deps, state } = ctx;
  state.step += 1;
  state.ordinal = 0;
  state.teachings = [];
  state.captures = [];
  const observation = await deps.browser.observe();
  const screenshot = await deps.browser.screenshot(null).catch(() => null);
  noteObservation(state, observationFingerprint(observation));
  settleExpectation(ctx, observation);
  ctx.dumpFiles('step files', observationFiles(state.step, observation, screenshot));
  // A read that did not reach the page is counted, and one that did clears the count.
  state.unreadablePages = observation.unread === null ? 0 : state.unreadablePages + 1;
  return observation;
}

/** A brain that answered nothing: the fault on the record, in the history, and no plan ran. */
function recordBrainFault(ctx: EngineContext, error: BrainFaulted, durationMs: number): void {
  const { deps, state } = ctx;
  state.brainFaults += 1;
  ctx.record({
    kind: 'step-plan',
    source: 'engine',
    loopRunId: null,
    loopOrchestrationId: null,
    ref: null,
    question: null,
    answer: null,
    rests: null,
    durationMs,
    payload: { fault: error.reason, message: error.message },
  });
  ctx.dumpFiles('fault', [
    stepJsonFile(state.step, 'fault', { reason: error.reason, message: error.message }),
  ]);
  pushHistory(state, 'plan', 'failed', `brain ${error.reason}: ${error.message}`);
  state.lastStep = NOTHING_RAN;
  deps.warn(`step ${state.step}: no plan — ${error.message}`);
}

/** The loop's plan for this page, timed; null once a brain fault has been recorded. */
async function decide(
  ctx: EngineContext,
  observation: PageObservation,
): Promise<{ decided: Decided<StepPlan>; durationMs: number; advice: AdviceRecord } | null> {
  const { deps, state, options } = ctx;
  // What the advisors know of units beyond this session, asked before every
  // plan: the next item is chosen inside the plan that closes the unit, so no
  // step can go without. The step's file records what the composer saw.
  const advice = await recallAdvice(ctx);
  if (advice.outcome !== 'no-advisors') {
    ctx.dumpFiles('advice', [stepJsonFile(state.step, 'advice', advice)]);
  }
  const startedAt = deps.clock.now();
  const elapsed = (): number => deps.clock.now().getTime() - startedAt.getTime();
  try {
    const decided = await deps.brain.planStep({
      session: { sessionId: state.sessionId, step: state.step },
      mission: ctx.mission,
      observation,
      history: [...state.history],
      ledger: ledgerSummaryOf(state, options.rails),
      objections: [...state.objections],
      criteria: ctx.criteria.plan,
      pageUnchanged: state.pageUnchanged,
      lastStep: state.lastStep,
      progress: progressOf(state),
      onRecord: advice.onRecord,
    });
    // An answered plan clears the count: the rail stops on faults in a row.
    state.brainFaults = 0;
    return { decided, durationMs: elapsed(), advice };
  } catch (error) {
    if (!(error instanceof BrainFaulted)) throw error;
    recordBrainFault(ctx, error, elapsed());
    return null;
  }
}

/**
 * The plan read back: whatever objected is recorded once, whether or not the
 * plan runs — a plan cut short owes the next producer the reasons as much as
 * a refused one — and the decision, the plan file and the log line follow.
 */
function recordPlan(
  ctx: EngineContext,
  decided: Decided<StepPlan>,
  durationMs: number,
  advice: AdviceRecord,
): PlanReadout {
  const { deps, state } = ctx;
  const readout = routePlan(decided.run, state.step);
  pushObjections(
    state,
    readout.objections.length > 0
      ? readout.objections
      : readout.reason === null
        ? []
        : [{ step: state.step, from: ENGINE_OBJECTORS.controller, at: [], detail: readout.reason }],
  );
  ctx.record({
    kind: 'step-plan',
    source: 'loop',
    loopRunId: decided.runId,
    loopOrchestrationId: decided.orchestrationRunId,
    ref: null,
    question: null,
    answer: null,
    rests: null,
    durationMs,
    payload: planPayload(readout, decided, advice),
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
    `step ${state.step}: ${
      readout.executable
        ? `${readout.executePrefix} of ${readout.plan?.actions.length ?? 0} action(s) to run`
        : `not executed: ${readout.reason}`
    } (run ${decided.runId})`,
  );
  return readout;
}

/**
 * A plan that does not run: one history entry for the plan, not one per
 * action it proposed. Measured on 2026-10-07: a refused six-action plan wrote
 * six not-executed entries, two refusals filled HISTORY_MAX, and the producer
 * read its own refused proposals — "terminate limit-reached" among them — as
 * the session's recent past. The actions themselves stay whole in the step's
 * plan.json, and why it did not run is an objection, carried once.
 */
function refusePlan(ctx: EngineContext, readout: PlanReadout): void {
  const { state } = ctx;
  pushHistory(state, describeRefusedPlan(readout.plan), 'not-executed', null);
  state.lastStep = NOTHING_RAN;
  ctx.fail('plan-not-executed');
}

/**
 * What the evaluator passed waits for the next observation: settled, if the
 * page moved, for the unit when one was open before or after the plan, else
 * for the session — every pass when the plan ran whole, else the passes an
 * action that ran said it served. A plan that closed a unit settles nothing:
 * what it passed was that unit's, and the unit is gone — whether the plan
 * ended there, went on to open the next unit, or opened and closed one.
 */
function settlePasses(
  ctx: EngineContext,
  readout: PlanReadout & { plan: StepPlan },
  executed: Executed,
  before: { open: boolean; closed: number },
): void {
  const { state } = ctx;
  if (tasksClosed(state) !== before.closed) return;
  const scope = before.open || state.tasks.open !== null ? 'unit' : 'session';
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

/**
 * A unit of work's pages close with it: once the plan in which a unit closed
 * has run whole — a mission may go on from a `taskDone` to a click on the
 * same page, so never inside the close itself — every page opened since the
 * session opened or since the last such close is closed, and the next step
 * observes the page the unit was taken from. The last action's promise was
 * about a page now gone, so it is dropped rather than counted unmet. A
 * session whose units open no page sees nothing: nothing closed, no line.
 */
async function closeUnitPages(ctx: EngineContext): Promise<void> {
  const { deps, state } = ctx;
  let closed: PagesClosed;
  try {
    closed = await deps.browser.closeOpenedPages();
  } catch (error) {
    if (!(error instanceof ActionFailed)) throw error;
    pushHistory(state, CLOSING_PAGES, 'failed', error.message);
    return;
  }
  if (closed.closed === 0) return;
  state.pending = null;
  pushHistory(
    state,
    describeClosedPages(closed.closed),
    'ok',
    `the page in front is ${closed.front}`,
  );
}

/** The executable prefix run against the page — every taskStart held to the record the plan was composed with — and what it passed held for the next observation. */
async function executePlan(
  ctx: EngineContext,
  decided: Decided<StepPlan>,
  readout: PlanReadout & { plan: StepPlan },
  observation: PageObservation,
  onRecord: UnitsOnRecord,
): Promise<Termination | null> {
  const { state } = ctx;
  const before = { open: state.tasks.open !== null, closed: tasksClosed(state) };
  const executed = await executeActions(ctx, decided, readout, observation, onRecord);
  if (executed.termination !== null) return executed.termination;
  if (tasksClosed(state) !== before.closed) await closeUnitPages(ctx);
  settlePasses(ctx, readout, executed, before);
  return null;
}

/** One page: observe, plan through the loop, read the plan back, run what nobody objected to, check the rails. */
export async function step(ctx: EngineContext): Promise<Termination | null> {
  const observation = await observe(ctx);
  // The rails are checked before the brain is asked for anything: a page that
  // will not read is not a plan anybody can write, and a session out of time
  // or units of work should not spend another run finding out.
  const railed = rails(ctx);
  if (railed !== null) return railed;
  const planned = await decide(ctx, observation);
  if (planned === null) return rails(ctx);
  const readout = recordPlan(ctx, planned.decided, planned.durationMs, planned.advice);
  if (!readout.executable || readout.plan === null) {
    refusePlan(ctx, readout);
    return rails(ctx);
  }
  const ended = await executePlan(
    ctx,
    planned.decided,
    { ...readout, plan: readout.plan },
    observation,
    planned.advice.onRecord,
  );
  return ended ?? rails(ctx);
}
