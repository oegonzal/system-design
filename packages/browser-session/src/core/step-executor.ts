import {
  CLOSED_TASKS_BOUND,
  MISSION_STOP,
  stopsOf,
  TASK_OUTCOME_STATUS,
  type PageObservation,
  type PlanReadout,
  type StepAction,
  type StepPlan,
} from '@sysdesign/contracts';

import { captureAfter, touchedName } from './capture';
import type { EngineContext } from './engine-context';
import { exactCheckOf } from './expectations';
import { askFields } from './field-flow';
import {
  ActionFailed,
  isBrowserAction,
  type BrowserAction,
  type Decided,
  type Termination,
} from './ports';
import { labelledScreenshot } from './session-dump';
import { unitClosedEvent, unitOpenedEvent } from './session-events';
import {
  clearObjections,
  describeAction,
  pushHistory,
  touchedBy,
  type OpenTask,
} from './session-state';

/**
 * Running the unfaulted prefix of a plan, action by action. A browser action
 * goes to the browser and leaves its promise pending for the next
 * observation; the engine's own events — units of work opening and closing,
 * fields asked, a screenshot, the end — are handled here. The first
 * `ActionFailed` — a browser action's or a field fill's — stops the plan and
 * counts one failed step. The history records what happened, each action
 * once; what the plan proposed and did not run is the last step's `held`,
 * which the next goal states beside the page it was held for.
 */

function openTask(
  ctx: EngineContext,
  action: Extract<StepAction, { kind: 'taskStart' }>,
  label: string,
): void {
  const { state, deps, queue } = ctx;
  if (state.tasks.open !== null) {
    pushHistory(state, label, 'not-executed', 'a unit of work is already open');
    return;
  }
  const task: OpenTask = {
    id: crypto.randomUUID(),
    ordinal: state.tasks.started + 1,
    label: action.label,
    url: action.url,
    facets: action.facets,
    startStep: state.step,
  };
  state.tasks.open = task;
  state.tasks.started = task.ordinal;
  const startedAt = deps.clock.now();
  queue.write(`task ${task.ordinal} open`, () =>
    deps.ledger.openTask({
      id: task.id,
      sessionId: state.sessionId,
      ordinal: task.ordinal,
      label: task.label,
      externalRef: task.url,
      facets: task.facets,
      startStep: task.startStep,
      startedAt,
    }),
  );
  ctx.events.publish(unitOpenedEvent(ctx, task));
  pushHistory(state, label, 'ok', null);
}

async function closeTask(
  ctx: EngineContext,
  action: Extract<StepAction, { kind: 'taskDone' }>,
  label: string,
): Promise<void> {
  const { state, deps, queue } = ctx;
  const task = state.tasks.open;
  if (task === null) {
    pushHistory(state, label, 'not-executed', 'no unit of work is open');
    return;
  }
  const status = TASK_OUTCOME_STATUS[action.outcome];
  state.tasks.counts[action.outcome] += 1;
  // The next goal lists what this session handled, most recent last; past the
  // bound the oldest is counted rather than cut without a word.
  state.tasks.closed.push({ label: task.label, outcome: action.outcome, facets: [...task.facets] });
  if (state.tasks.closed.length > CLOSED_TASKS_BOUND.target) {
    state.tasks.closed.shift();
    state.tasks.closedOmitted += 1;
  }
  state.tasks.open = null;
  // What this unit's plans settled was settled for this unit.
  state.reached.unit.clear();
  // Captured now: the write runs later, when the engine may be steps ahead.
  const close = {
    status,
    outcome: action.outcome,
    endStep: state.step,
    finishedAt: deps.clock.now(),
  };
  queue.write(`task ${task.ordinal} close`, () => deps.ledger.closeTask(task.id, close));
  ctx.events.publish(unitClosedEvent(ctx, task, action.outcome));
  pushHistory(state, label, 'ok', null);
}

/** One of the engine's own events; true when it failed and the plan must stop. */
async function perform(
  ctx: EngineContext,
  action: Exclude<StepAction, BrowserAction | { kind: 'terminate' }>,
  label: string,
  observation: PageObservation,
): Promise<{ failed: boolean; stopped: boolean }> {
  const { deps, state } = ctx;
  switch (action.kind) {
    case 'screenshot': {
      const bytes = await deps.browser.screenshot(null);
      ctx.dumpFiles('screenshot', [labelledScreenshot(state.step, action.label, bytes)]);
      pushHistory(state, label, 'ok', null);
      return { failed: false, stopped: false };
    }
    case 'askFields': {
      const outcome = await askFields(ctx, action.refs, observation);
      pushHistory(state, label, outcome.failed ? 'failed' : 'ok', outcome.note);
      // A /stop the operator typed is theirs; a stop the stopping signal brought was named by
      // whoever raised it — Ctrl-C marks the session itself, and the time limit is the rails' to report.
      if (outcome.stopped && !ctx.stopping.aborted) state.operatorStopped = true;
      return { failed: outcome.failed, stopped: outcome.stopped };
    }
    case 'taskStart':
      openTask(ctx, action, label);
      return { failed: false, stopped: false };
    case 'taskDone':
      await closeTask(ctx, action, label);
      return { failed: false, stopped: false };
    case 'done':
      pushHistory(state, label, 'ok', null);
      return { failed: false, stopped: false };
  }
}

/** A browser action; true when the page refused it. */
async function act(
  ctx: EngineContext,
  action: BrowserAction,
  label: string,
  observation: PageObservation,
): Promise<boolean> {
  const { deps, state } = ctx;
  const described = { label, touched: touchedName(action, observation) };
  try {
    await deps.browser.act(action);
  } catch (error) {
    if (!(error instanceof ActionFailed)) throw error;
    pushHistory(state, label, 'failed', error.message);
    await captureAfter(ctx, action, described, 'failed');
    return true;
  }
  pushHistory(state, label, 'ok', null);
  await captureAfter(ctx, action, described, 'ok');
  state.pending = {
    action: label,
    expect: action.expect,
    check: exactCheckOf(action, observation),
  };
  return false;
}

/** How a plan's execution ended: by the mission's own stop, or with what ran. */
export interface Executed {
  termination: Termination | null;
  /** Every action the plan proposed ran and none failed. */
  ranWhole: boolean;
  /** How many leading actions ran without failing. */
  ranOk: number;
}

/**
 * The actions before the first faulted one, in order, stopping at the first
 * the page refuses; a termination when the plan declared one. What did not
 * run goes into the history with why — and the failure count moves once per
 * step, whichever action failed.
 */
export async function executeActions(
  ctx: EngineContext,
  decided: Decided<StepPlan>,
  readout: PlanReadout & { plan: StepPlan },
  observation: PageObservation,
): Promise<Executed> {
  const { state } = ctx;
  const actions = readout.plan.actions;
  const prefix = actions.slice(0, readout.executePrefix);
  /** Where the prefix stopped: the index after the last action attempted. */
  let next = 0;
  let failed = false;
  for (const action of prefix) {
    next += 1;
    const label = describeAction(action, observation);
    if (action.kind === 'terminate') {
      pushHistory(state, label, 'ok', null);
      // The cause is one the mission declares — the limits validator cuts any
      // other — and its ending is the status the mission gave it. A cause no
      // stop declares (a loop that ran no validator) ends the session stopped,
      // never complete.
      const declared = stopsOf(ctx.mission).find((stop) => stop.cause === action.cause);
      return {
        termination: ctx.terminate(
          {
            reason: MISSION_STOP,
            cause: action.cause,
            ending: declared?.ending ?? 'stopped',
            detail: action.detail,
          },
          'loop',
          decided.runId,
        ),
        ranWhole: false,
        ranOk: next - 1,
      };
    }
    if (isBrowserAction(action)) {
      failed = await act(ctx, action, label, observation);
    } else {
      const outcome = await perform(ctx, action, label, observation);
      if (outcome.stopped) return { termination: null, ranWhole: false, ranOk: next - 1 };
      failed = outcome.failed;
    }
    if (failed) break;
  }
  if (failed) ctx.fail('action-failed');
  else state.consecutiveFailures = 0;

  // Every action the plan proposed ran, and none failed: the objections are spent.
  const ranWhole = !failed && actions.length === prefix.length;
  if (ranWhole) clearObjections(state);
  const ranOk = failed ? next - 1 : next;
  state.lastStep = {
    ran: ranOk,
    // What ran, as the page would recognise it again: the next goal says what
    // led to its page, and on an unchanged page a repeat of it is cut.
    touched: touchedBy(prefix.slice(0, ranOk), observation.elements),
    // What the plan proposed past what ran: planned before the next page could be seen.
    held: actions.slice(next).map((action) => action.kind),
  };
  return { termination: null, ranWhole, ranOk };
}
