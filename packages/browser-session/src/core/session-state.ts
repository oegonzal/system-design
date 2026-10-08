import {
  HISTORY_ACTION_BOUND,
  HISTORY_MAX,
  HISTORY_NOTE_BOUND,
  OBJECTION_AT_BOUND,
  OBJECTION_AT_MAX_LENGTH,
  OBJECTION_DETAIL_BOUND,
  OBJECTION_FROM_MAX_LENGTH,
  OBJECTIONS_MAX,
  SPENDING_TASK_OUTCOMES,
  TASK_OUTCOMES,
  type DocumentChunk,
  type PageObservation,
  type RanAction,
  type SessionRailsDto,
  type StepAction,
  type StepHistoryEntry,
  type StepObjection,
  type StepPlan,
  type TaskLedgerSummary,
  type TaskOutcome,
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

/** One operator answer handed to the memory, as the step's dump records it. */
export interface Teaching {
  decisionId: string;
  document: DocumentChunk;
  orchestrationRunId: string | null;
  fault: string | null;
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
  /**
   * The open unit, how many have opened, how many closed by each outcome, and
   * the closed ones by label and outcome — the most recent `CLOSED_TASKS_BOUND`,
   * the rest counted — so the next goal can say which items this session has
   * handled.
   */
  tasks: {
    open: OpenTask | null;
    started: number;
    counts: Record<TaskOutcome, number>;
    closed: TaskLedgerSummary['closed'];
    closedOmitted: number;
  };
  consecutiveFailures: number;
  brainFaults: number;
  /** Observations in a row the adapter could not read the page from; reset by one it could. */
  unreadablePages: number;
  /** The identity of the page the current step observed, compared with the step before. */
  fingerprint: string | null;
  /** Whether this step's page is the same page the last step observed. */
  pageUnchanged: boolean;
  /** Observations in a row of a page that did not change, whatever the steps between them did; reset by a page that moved. */
  stalledSteps: number;
  operatorStopped: boolean;
  /** What the last executed action promised, checked against the next observation. */
  pending: PendingExpectation | null;
  /**
   * The criteria settled by plans that moved the page — every pass of a plan
   * that ran whole, else the passes an action that ran said it served: for
   * the session, when no unit of work was open; for the open unit otherwise,
   * cleared when it closes. A step of a unit may repeat on its next page, so
   * only the session's are taken out of the rubric.
   */
  reached: { session: Set<string>; unit: Set<string> };
  /** What the last plan passed, by id, awaiting the next observation: settled only if the page moved. */
  pendingPass: { ids: readonly string[]; scope: 'session' | 'unit' } | null;
  /** How many actions the last plan ran without failing; 0 for a plan refused whole, and before any plan. */
  lastRan: number;
  /** What the last plan ran, as the page would recognise it again; the next goal says it, and a repeat on an unchanged page is cut. */
  ranActions: RanAction[];
  /** The operator's answers this session, by field label. */
  operatorAnswers: Map<string, string>;
  /**
   * What this session settled into fields, by label — filled, kept, or
   * answered by the operator — so a field that still holds one of these
   * values is kept without a run. Measured 2026-10-07: three fields the site
   * had filled were sent to the answerer thirty-two times, every fill
   * writing the value the page already showed.
   */
  filled: Map<string, string>;
  /** What this step taught the memory, one record per operator answer, for the step's dump. */
  teachings: Teaching[];
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
    tasks: { open: null, started: 0, counts: zeroCounts(), closed: [], closedOmitted: 0 },
    consecutiveFailures: 0,
    brainFaults: 0,
    unreadablePages: 0,
    fingerprint: null,
    pageUnchanged: false,
    stalledSteps: 0,
    operatorStopped: false,
    pending: null,
    reached: { session: new Set(), unit: new Set() },
    pendingPass: null,
    lastRan: 0,
    ranActions: [],
    operatorAnswers: new Map(),
    filled: new Map(),
    teachings: [],
    decisions: 0,
    ordinal: 0,
    terminationRecorded: false,
  };
}

/** One zero per outcome the vocabulary declares. */
const zeroCounts = (): Record<TaskOutcome, number> =>
  Object.fromEntries(TASK_OUTCOMES.map((outcome) => [outcome, 0])) as Record<TaskOutcome, number>;

const countOf = (state: SessionState, outcomes: readonly TaskOutcome[]): number =>
  outcomes.reduce((sum, outcome) => sum + state.tasks.counts[outcome], 0);

/** Units of work closed, whatever their outcome. */
export const tasksClosed = (state: SessionState): number => countOf(state, TASK_OUTCOMES);

/** Units of work closed by an outcome that spends the budget. */
export const tasksSpent = (state: SessionState): number => countOf(state, SPENDING_TASK_OUTCOMES);

export const railStateOf = (state: SessionState): RailState => ({
  startedAt: state.startedAt,
  tasksStarted: state.tasks.started,
  tasksSpent: tasksSpent(state),
  openTask: state.tasks.open !== null,
  consecutiveFailures: state.consecutiveFailures,
  brainFaults: state.brainFaults,
  unreadablePages: state.unreadablePages,
  stalledSteps: state.stalledSteps,
  operatorStopped: state.operatorStopped,
});

/**
 * The page this step observed, held against the last: the identity is kept
 * for the next comparison, and an observation of the page the last step
 * already saw is one more the stall rail counts — whether the step between
 * them was refused, failed, or ran and moved nothing. Measured 2026-10-07:
 * twelve observations in a row of one unchanged page, each step a navigate
 * that ran clean, and a count of failed steps saw none of them. A page that
 * moved ends the stall.
 */
export function noteObservation(state: SessionState, fingerprint: string): void {
  state.pageUnchanged = state.fingerprint === fingerprint;
  state.fingerprint = fingerprint;
  state.stalledSteps = state.pageUnchanged ? state.stalledSteps + 1 : 0;
  // A pass the evaluator gave the last plan becomes a session fact only once
  // the engine's own identity says the page moved: one sample's word is
  // evidence, and the page moving is the corroboration.
  if (state.pendingPass !== null && !state.pageUnchanged) {
    for (const id of state.pendingPass.ids) state.reached[state.pendingPass.scope].add(id);
  }
  state.pendingPass = null;
}

/** What the next run is told it has settled, and what the open unit has done. */
export const progressOf = (state: SessionState): { settled: string[]; done: string[] } => ({
  settled: [...state.reached.session],
  done: [...state.reached.unit],
});

/** The units of work as the next goal is told them. */
export const ledgerSummaryOf = (
  state: SessionState,
  rails: SessionRailsDto,
): TaskLedgerSummary => ({
  openTask:
    state.tasks.open === null ? null : { label: state.tasks.open.label, url: state.tasks.open.url },
  closed: [...state.tasks.closed],
  closedOmitted: state.tasks.closedOmitted,
  counts: { ...state.tasks.counts },
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
