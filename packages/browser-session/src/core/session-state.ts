import {
  HISTORY_ACTION_BOUND,
  HISTORY_MAX,
  HISTORY_NOTE_BOUND,
  OBJECTION_AT_BOUND,
  OBJECTION_AT_MAX_LENGTH,
  OBJECTION_DETAIL_BOUND,
  OBJECTION_FROM_MAX_LENGTH,
  OBJECTIONS_MAX,
  type OperatorGuidanceDto,
  type PageObservation,
  type SessionRailsDto,
  type StepAction,
  type StepHistoryEntry,
  type StepObjection,
  type StepPlan,
  type TaskLedgerSummary,
} from '@sysdesign/contracts';

import type { PendingExpectation } from './expectations';
import { remainingTasks, type RailState } from './rails';
import { clip, quote } from './text';

/**
 * What the engine carries between steps: counts the rails read, the recent
 * past the next goal is told, the unit of work that is open, the operator's
 * answers so far. All of it is plain data a spec can inspect; none of it is
 * a judgement.
 */
export interface OpenTask {
  id: string;
  ordinal: number;
  label: string;
  url: string;
  startStep: number;
}

/** An answer the operator gave, with the decision row it was recorded on, so the teaching lands on that row. */
export interface TaughtAnswer {
  decisionId: string;
  item: OperatorGuidanceDto;
}

export interface SessionState {
  sessionId: string;
  dumpRunId: string;
  startedAt: Date;
  /** The page being worked on, 1-based; 0 before the first observation. */
  step: number;
  /** Most recent last, at most `HISTORY_MAX`. */
  history: StepHistoryEntry[];
  /**
   * Why the plans before this one did not run, newest first. Kept until a plan
   * runs every action it proposed: until then the next producer is owed the
   * reasons, and a plan that was cut short has reasons of its own.
   */
  objections: StepObjection[];
  tasks: { open: OpenTask | null; started: number; done: number; skipped: number; failed: number };
  consecutiveFailures: number;
  brainFaults: number;
  /** Observations in a row the adapter could not read the page from; reset by one it could. */
  unreadablePages: number;
  /** The identity of the page the current step observed, compared with the step before. */
  fingerprint: string | null;
  /** Whether this step's page is the same page the last step observed. */
  pageUnchanged: boolean;
  /** Failed steps in a row on an unchanged page; reset by a step that ran clean or a page that moved. */
  stalledSteps: number;
  operatorStopped: boolean;
  /** What the last executed action promised, checked against the next observation. */
  pending: PendingExpectation | null;
  /** The operator's answers this session, by field label. */
  operatorAnswers: Map<string, string>;
  /** The operator's answers during the open unit of work, taught back when it closes. */
  guidance: TaughtAnswer[];
  /** Decisions recorded so far, and the next ordinal within the current step. */
  decisions: number;
  ordinal: number;
  terminationRecorded: boolean;
}

export function createState(ids: {
  sessionId: string;
  dumpRunId: string;
  startedAt: Date;
}): SessionState {
  return {
    ...ids,
    step: 0,
    history: [],
    objections: [],
    tasks: { open: null, started: 0, done: 0, skipped: 0, failed: 0 },
    consecutiveFailures: 0,
    brainFaults: 0,
    unreadablePages: 0,
    fingerprint: null,
    pageUnchanged: false,
    stalledSteps: 0,
    operatorStopped: false,
    pending: null,
    operatorAnswers: new Map(),
    guidance: [],
    decisions: 0,
    ordinal: 0,
    terminationRecorded: false,
  };
}

export const tasksClosed = (state: SessionState): number =>
  state.tasks.done + state.tasks.skipped + state.tasks.failed;

export const railStateOf = (state: SessionState): RailState => ({
  startedAt: state.startedAt,
  tasksStarted: state.tasks.started,
  tasksClosed: tasksClosed(state),
  openTask: state.tasks.open !== null,
  consecutiveFailures: state.consecutiveFailures,
  brainFaults: state.brainFaults,
  unreadablePages: state.unreadablePages,
  stalledSteps: state.stalledSteps,
  operatorStopped: state.operatorStopped,
});

/**
 * The page this step observed, held against the last: the identity is kept
 * for the next comparison, and whether it changed is what a failed step is
 * read with. A page that moved ends any stall whatever the step then does.
 */
export function noteObservation(state: SessionState, fingerprint: string): void {
  state.pageUnchanged = state.fingerprint === fingerprint;
  state.fingerprint = fingerprint;
  if (!state.pageUnchanged) state.stalledSteps = 0;
}

/** The units of work as the next goal is told them. */
export const ledgerSummaryOf = (
  state: SessionState,
  rails: SessionRailsDto,
): TaskLedgerSummary => ({
  openTask:
    state.tasks.open === null ? null : { label: state.tasks.open.label, url: state.tasks.open.url },
  done: state.tasks.done,
  skipped: state.tasks.skipped,
  failed: state.tasks.failed,
  remainingTasks: remainingTasks(railStateOf(state), rails),
});

/**
 * The objections recorded once each, newest first, clipped to their declared
 * bounds. They are not written onto the actions they were about: one note per
 * action meant the same plan-level text copied once per action, cut at the
 * note's 300 characters, and `HISTORY_MAX` entries of duplication evicting
 * the record of what the session had actually done.
 */
export function pushObjections(state: SessionState, objections: readonly StepObjection[]): void {
  state.objections.unshift(
    ...objections.map((objection) => ({
      step: objection.step,
      from: clip(objection.from, OBJECTION_FROM_MAX_LENGTH),
      at: objection.at
        .slice(0, OBJECTION_AT_BOUND.target)
        .map((ref) => clip(ref, OBJECTION_AT_MAX_LENGTH)),
      detail: clip(objection.detail, OBJECTION_DETAIL_BOUND.target),
    })),
  );
  if (state.objections.length > OBJECTIONS_MAX) state.objections.length = OBJECTIONS_MAX;
}

/** A plan ran every action it proposed: nothing is owed to the next producer. */
export const clearObjections = (state: SessionState): void => {
  state.objections.length = 0;
};

export function pushHistory(
  state: SessionState,
  action: string,
  outcome: StepHistoryEntry['outcome'],
  note: string | null,
): void {
  state.history.push({
    action: clip(action, HISTORY_ACTION_BOUND.target),
    outcome,
    note: note === null ? null : clip(note, HISTORY_NOTE_BOUND.target),
  });
  if (state.history.length > HISTORY_MAX)
    state.history.splice(0, state.history.length - HISTORY_MAX);
}

const named = (ref: string, observation: PageObservation): string => {
  const element = observation.elements.find((candidate) => candidate.ref === ref);
  return element === undefined ? ref : `${ref} ${element.role} ${quote(element.name)}`;
};

/**
 * A plan that did not run, as one line: how many actions and of what kinds.
 * Never the actions' own words — a refused `terminate limit-reached` rendered
 * whole reads, a step later, as a limit that was reached.
 */
export const describeRefusedPlan = (plan: StepPlan | null): string =>
  plan === null
    ? 'plan'
    : `plan of ${plan.actions.length} action(s): ${plan.actions.map((action) => action.kind).join(', ')}`;

/** One action as the next goal reads it back: refs with the role and name they had, so a new page's refs are never mistaken for them. */
export function describeAction(action: StepAction, observation: PageObservation): string {
  switch (action.kind) {
    case 'navigate':
      return `navigate ${action.url}`;
    case 'click':
      return `click ${named(action.ref, observation)}`;
    case 'fill':
      return `fill ${named(action.ref, observation)} with ${quote(action.value)}`;
    case 'select':
      return `select ${quote(action.option)} in ${named(action.ref, observation)}`;
    case 'press':
      return `press ${action.key}`;
    case 'scroll':
      return `scroll ${action.direction}${action.ref === null ? '' : ` to ${named(action.ref, observation)}`}`;
    case 'waitFor':
      return `waitFor ${action.until} ${action.until === 'element' ? named(action.value, observation) : quote(action.value)}`;
    case 'screenshot':
      return `screenshot ${quote(action.label)}`;
    case 'askFields':
      return `askFields ${action.refs.map((ref) => named(ref, observation)).join(', ')}`;
    case 'taskStart':
      return `taskStart ${quote(action.label)}`;
    // A terminal action's detail is a claim about the page. An executed
    // terminate ends the session, so one in the history by construction never
    // ran; rendered with its words it read, a step later, as a limit that was
    // reached. The kind and its cause or outcome are the fact; the words stay
    // in the step's plan.json.
    case 'taskDone':
      return `taskDone ${action.outcome}`;
    case 'terminate':
      return `terminate ${action.cause}`;
    case 'done':
      return 'done';
  }
}
