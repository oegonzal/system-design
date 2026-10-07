import {
  TASK_OUTCOME_STATUS,
  type BrowserTaskStatus,
  type PageObservation,
  type PlanReadout,
  type StepAction,
  type StepPlan,
} from '@sysdesign/contracts';

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
import { clearObjections, describeAction, pushHistory, type OpenTask } from './session-state';

/** What a history entry says about an action the plan proposed past its executable prefix. */
const CUT_NOTE = 'past the executable prefix';
/**
 * Running the unfaulted prefix of an accepted plan, action by action. A
 * browser action goes to the browser and leaves its promise pending for the
 * next observation; the engine's own events — units of work opening and
 * closing, fields asked, a screenshot, the end — are handled here. The
 * first `ActionFailed` — a browser action's or a field fill's — stops the
 * plan and counts one failed step; what did not run is carried into the
 * history as not-executed with its reason, the rest of the prefix as
 * "after a failed action" and what a judge or validator cut as their words,
 * so the next plan is told both.
 */

/** Which count a closed unit of work moves, by the status its outcome maps to. */
const TASK_COUNT_BY_STATUS: Readonly<
  Record<BrowserTaskStatus, 'done' | 'skipped' | 'failed' | null>
> = { open: null, complete: 'done', abandoned: 'skipped', failed: 'failed' };

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
      startStep: task.startStep,
      startedAt,
    }),
  );
  pushHistory(state, label, 'ok', action.expect);
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
  const count = TASK_COUNT_BY_STATUS[status];
  if (count !== null) state.tasks[count] += 1;
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
  pushHistory(state, label, 'ok', action.expect);
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
      const bytes = await deps.browser.screenshot();
      ctx.dumpFiles('screenshot', [labelledScreenshot(state.step, action.label, bytes)]);
      pushHistory(state, label, 'ok', action.expect);
      return { failed: false, stopped: false };
    }
    case 'askFields': {
      const outcome = await askFields(ctx, action.refs, observation);
      pushHistory(state, label, outcome.failed ? 'failed' : 'ok', outcome.note);
      if (outcome.stopped) state.operatorStopped = true;
      return { failed: outcome.failed, stopped: outcome.stopped };
    }
    case 'taskStart':
      openTask(ctx, action, label);
      return { failed: false, stopped: false };
    case 'taskDone':
      await closeTask(ctx, action, label);
      return { failed: false, stopped: false };
    case 'done':
      pushHistory(state, label, 'ok', action.expect);
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
  try {
    await deps.browser.act(action);
  } catch (error) {
    if (!(error instanceof ActionFailed)) throw error;
    pushHistory(state, label, 'failed', error.message);
    return true;
  }
  pushHistory(state, label, 'ok', action.expect);
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
      return {
        termination: ctx.terminate(
          { reason: action.cause, detail: action.detail },
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

  for (const action of prefix.slice(next)) {
    pushHistory(
      state,
      describeAction(action, observation),
      'not-executed',
      'after a failed action',
    );
  }
  for (const action of actions.slice(prefix.length)) {
    // Why it was cut is an objection the next goal carries whole; the note says only that it was.
    pushHistory(state, describeAction(action, observation), 'not-executed', CUT_NOTE);
  }
  // Every action the plan proposed ran, and none failed: the objections are spent.
  const ranWhole = !failed && actions.length === prefix.length;
  if (ranWhole) clearObjections(state);
  return { termination: null, ranWhole, ranOk: failed ? next - 1 : next };
}
