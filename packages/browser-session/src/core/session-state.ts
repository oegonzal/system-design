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
  type LastStep,
  type PageObservation,
  type RanAction,
  type SessionRailsDto,
  type StepAction,
  type StepHistoryEntry,
  type StepObjection,
  type StepPlan,
  type TaskLedgerSummary,
  type TaskOutcome,
  type UnitFacet,
  excerpt,
  quoted,
  ranActionOf,
} from '@sysdesign/contracts';

import type { PendingExpectation } from './expectations';
import { remainingTasks, type RailState } from './rails';
import type { CaptureRecord } from './session-dump';

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
  /** The unit's identity as the plan declared it: the facts the mission's Unit identity names. */
  facets: readonly UnitFacet[];
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
   * Why the plans made on this page did not run, or were cut, newest first.
   * Kept while the page stays the one they were raised on, and until a plan
   * runs every action it proposed: a plan for a new page answers that page.
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
  /** Brain calls in a row that answered nothing; reset by one that answered. */
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
  /** What the last step did, as the next goal tells it; null before the first plan. */
  lastStep: LastStep | null;
  /** The operator's answers this session, by what each field asks (`fieldQuestionOf`). */
  operatorAnswers: Map<string, string>;
  /**
   * What this session settled into fields, by what each asks — filled, kept, or
   * answered by the operator — so a field that still holds one of these
   * values is kept without a run. Measured 2026-10-07: three fields the site
   * had filled were sent to the answerer thirty-two times, every fill
   * writing the value the page already showed.
   */
  filled: Map<string, string>;
  /** What this step taught the memory, one record per operator answer, for the step's dump. */
  teachings: Teaching[];
  /** What this step captured after its actions, in order, for the step's dump. */
  captures: CaptureRecord[];
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
    lastStep: null,
    operatorAnswers: new Map(),
    filled: new Map(),
    teachings: [],
    captures: [],
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
  tasksDone: state.tasks.counts.done,
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
  // An objection is about a plan made on another page once this one has
  // moved: carried on, it reads as one to this page. Measured 2026-10-08: a
  // click that opened a listing was followed, step after step, by the last
  // page's "taskStart follows the click" and "open the first card" — and the
  // planner clicked a card again, twelve steps of 23.
  if (!state.pageUnchanged) clearObjections(state);
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
    state.tasks.open === null
      ? null
      : {
          label: state.tasks.open.label,
          url: state.tasks.open.url,
          facets: [...state.tasks.open.facets],
        },
  closed: [...state.tasks.closed],
  closedOmitted: state.tasks.closedOmitted,
  counts: { ...state.tasks.counts },
  remainingTasks: remainingTasks(railStateOf(state), rails),
  targetDone: rails.targetDone,
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
      from: excerpt(objection.from, OBJECTION_FROM_MAX_LENGTH),
      at: objection.at
        .slice(0, OBJECTION_AT_BOUND.target)
        .map((ref) => excerpt(ref, OBJECTION_AT_MAX_LENGTH)),
      detail: excerpt(objection.detail, OBJECTION_DETAIL_BOUND.target),
    })),
  );
  if (state.objections.length > OBJECTIONS_MAX) state.objections.length = OBJECTIONS_MAX;
}

/** Nothing is owed to the next producer: a plan ran every action it proposed, or the page moved. */
export function clearObjections(state: SessionState): void {
  state.objections.length = 0;
}

export function pushHistory(
  state: SessionState,
  action: string,
  outcome: StepHistoryEntry['outcome'],
  note: string | null,
): void {
  state.history.push({
    action: excerpt(action, HISTORY_ACTION_BOUND.target),
    outcome,
    note: note === null ? null : excerpt(note, HISTORY_NOTE_BOUND.target),
  });
  if (state.history.length > HISTORY_MAX)
    state.history.splice(0, state.history.length - HISTORY_MAX);
}

/** The last step of a plan that ran nothing: refused whole, faulted, or never answered. */
export const NOTHING_RAN: LastStep = { ran: 0, touched: [], held: [] };

/** The page actions among those that ran, as the page would recognise them again: a wait, a scroll or a unit event has no such identity. */
export const touchedBy = (
  actions: readonly StepAction[],
  elements: PageObservation['elements'],
): RanAction[] =>
  actions.flatMap((action) => {
    const ran = ranActionOf(action, elements);
    return ran === null ? [] : [ran];
  });

/**
 * An element as the next goal names it: by role and name. A ref is minted per
 * observation and names nothing on the next, so a history that carried refs
 * offered the planner tokens it could not cite. Measured 2026-10-08: a plan
 * cited `e114`, a ref from four observations before, and was refused.
 */
const named = (ref: string, observation: PageObservation): string => {
  const element = observation.elements.find((candidate) => candidate.ref === ref);
  return element === undefined
    ? 'an element no longer listed'
    : `${element.role} ${quoted(element.name)}`;
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

/** One action as the next goal reads it back: its element by role and name, never by a ref the next page will not have. */
export function describeAction(action: StepAction, observation: PageObservation): string {
  switch (action.kind) {
    case 'navigate':
      return `navigate ${action.url}`;
    case 'click':
      return `click ${named(action.ref, observation)}`;
    case 'fill':
      return `fill ${named(action.ref, observation)} with ${quoted(action.value)}`;
    case 'select':
      return `select ${quoted(action.option)} in ${named(action.ref, observation)}`;
    case 'press':
      return `press ${action.key}`;
    case 'scroll':
      return `scroll ${action.direction}${action.ref === null ? '' : ` to ${named(action.ref, observation)}`}`;
    case 'waitFor':
      return `waitFor ${action.until} ${action.until === 'element' ? named(action.value, observation) : quoted(action.value)}`;
    case 'screenshot':
      return `screenshot ${quoted(action.label)}`;
    case 'askFields':
      return `askFields ${action.refs.map((ref) => named(ref, observation)).join(', ')}`;
    case 'taskStart':
      return `taskStart ${quoted(action.label)}`;
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
