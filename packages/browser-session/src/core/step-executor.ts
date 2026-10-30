import {
  actionLocation,
  CLOSED_TASKS_BOUND,
  describeOnRecordRefusal,
  ENGINE_OBJECTORS,
  MISSION_STOP,
  noteOnRecordRefusal,
  noteOnRecordTaken,
  ON_RECORD_TAKEN,
  refusedOnRecord,
  stopsOf,
  takenStancesOf,
  TASK_OUTCOME_STATUS,
  unitOnRecordFor,
  unitContextLandmarkOf,
  type PageObservation,
  type PlanReadout,
  type StepAction,
  type StepPlan,
  type UnitsOnRecord,
} from '@sysdesign/contracts';

import { describeAction, touchedBy } from './action-words';
import { captureAfter, touchedName } from './capture';
import type { EngineContext } from './engine-context';
import { exactCheckOf } from './expectations';
import { askFields } from './field-flow';
import { unitContextOf } from './open-unit';
import {
  ActionFailed,
  isBrowserAction,
  type BrowserAction,
  type Decided,
  type Termination,
} from './ports';
import type { StepFailureEvent } from './rails';
import { labelledScreenshot } from './session-dump';
import { unitClosedEvent, unitOpenedEvent } from './session-events';
import { clearObjections, pushHistory, pushObjections, type OpenTask } from './session-state';

/**
 * Running the unfaulted prefix of a plan, action by action. A browser action
 * goes to the browser and leaves its promise pending for the next
 * observation; the engine's own events — units of work opening and closing,
 * fields asked, a screenshot, the end — are handled here. The first fault —
 * a browser action's `ActionFailed`, a field fill's, or a taskStart the
 * record refuses — stops the plan and counts one failed step. The history
 * records what happened, each action once; what the plan proposed and did not
 * run is the last step's `held`, which the next goal states beside the page it
 * was held for.
 */

/**
 * A unit opens for the item the plan names — unless the record the step was
 * composed with refuses it. Every unit the advisors answered is checked, never
 * only the ones the goal had room to list: measured 2026-10-14, a goal
 * rendered 40 of 43 units on record, and the planner opened one of the three
 * cut as "not on the list". A refusal is the plan's to answer on the next
 * page, so it is carried once as an objection, the history keeping the fact.
 * True when the record refused the unit and the plan stops; false when it
 * opened, or when one was open already and the plan goes on.
 */
function openTaskUnlessRefused(
  ctx: EngineContext,
  action: Extract<StepAction, { kind: 'taskStart' }>,
  label: string,
  position: number,
  onRecord: UnitsOnRecord,
): boolean {
  const { state, deps, queue } = ctx;
  if (state.tasks.open !== null) {
    pushHistory(state, label, 'not-executed', 'a unit of work is already open');
    return false;
  }
  // The stances the mission's exception names are the only ones a declaration lifts a refusal for.
  const declared = takenStancesOf(ctx.mission);
  const refused = refusedOnRecord(action, onRecord, declared);
  if (refused !== null) {
    pushHistory(state, label, 'not-executed', noteOnRecordRefusal(refused));
    pushObjections(state, [
      {
        step: state.step,
        from: ENGINE_OBJECTORS.session,
        at: [actionLocation(position)],
        detail: describeOnRecordRefusal(refused, declared),
      },
    ]);
    return true;
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
  // What the page states about the unit, from the observation it opens on:
  // the words under the landmark the mission declares, within the declared
  // bound. The validators cut a taskStart after any action that could have
  // changed the page, so the browser's last tree is the page this plan claims
  // shows the unit; that the page shows it is the plan's claim, which the
  // lenses judge against the page.
  const landmark = unitContextLandmarkOf(ctx.mission);
  state.tasks.contexts.set(
    task.id,
    landmark === null ? null : unitContextOf(deps.browser.wordsUnder(landmark), landmark),
  );
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
  // A declaration is recorded as data whether it took a unit on record or named
  // one the record never held: the next plan and the dump read what it did.
  pushHistory(
    state,
    label,
    'ok',
    action[ON_RECORD_TAKEN] === true
      ? noteOnRecordTaken(unitOnRecordFor(action.facets, onRecord))
      : null,
  );
  return false;
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

/** What one engine event did to the step: the failure it counts, if any, and whether the operator stopped the session. */
interface Performed {
  failure: StepFailureEvent | null;
  stopped: boolean;
}

const RAN: Performed = { failure: null, stopped: false };

/** One of the engine's own events, at its position in the plan, against the record the plan was composed with. */
async function perform(
  ctx: EngineContext,
  action: Exclude<StepAction, BrowserAction | { kind: 'terminate' }>,
  label: string,
  position: number,
  observation: PageObservation,
  onRecord: UnitsOnRecord,
): Promise<Performed> {
  const { deps, state } = ctx;
  switch (action.kind) {
    case 'screenshot': {
      const bytes = await deps.browser.screenshot(null);
      ctx.dumpFiles('screenshot', [labelledScreenshot(state.step, action.label, bytes)]);
      pushHistory(state, label, 'ok', null);
      return RAN;
    }
    case 'askFields': {
      const outcome = await askFields(ctx, action.refs, observation);
      pushHistory(state, label, outcome.failed ? 'failed' : 'ok', outcome.note);
      // A /stop the operator typed is theirs; a stop the stopping signal brought was named by
      // whoever raised it — Ctrl-C marks the session itself, and the time limit is the rails' to report.
      if (outcome.stopped && !ctx.stopping.aborted) state.operatorStopped = true;
      return { failure: outcome.failed ? 'action-failed' : null, stopped: outcome.stopped };
    }
    case 'taskStart': {
      // The actions after a refused taskStart were planned for a unit that
      // never opened: they do not run, as nothing runs past a refused click.
      const refused = openTaskUnlessRefused(ctx, action, label, position, onRecord);
      return { failure: refused ? 'unit-refused' : null, stopped: false };
    }
    case 'taskDone':
      await closeTask(ctx, action, label);
      return RAN;
    case 'done':
      pushHistory(state, label, 'ok', null);
      return RAN;
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
 * the page refuses or the record refuses; a termination when the plan
 * declared one. What did not run goes into the history with why — and the
 * failure count moves once per step, whichever action failed. `onRecord` is
 * the record the plan was composed with: every unit the advisors answered.
 */
export async function executeActions(
  ctx: EngineContext,
  decided: Decided<StepPlan>,
  readout: PlanReadout & { plan: StepPlan },
  observation: PageObservation,
  onRecord: UnitsOnRecord,
): Promise<Executed> {
  const { state } = ctx;
  const actions = readout.plan.actions;
  const prefix = actions.slice(0, readout.executePrefix);
  /** Where the prefix stopped: the index after the last action attempted. */
  let next = 0;
  let failure: StepFailureEvent | null = null;
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
      failure = (await act(ctx, action, label, observation)) ? 'action-failed' : null;
    } else {
      const outcome = await perform(ctx, action, label, next - 1, observation, onRecord);
      if (outcome.stopped) return { termination: null, ranWhole: false, ranOk: next - 1 };
      failure = outcome.failure;
    }
    if (failure !== null) break;
  }
  const failed = failure !== null;
  if (failure !== null) ctx.fail(failure);
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
