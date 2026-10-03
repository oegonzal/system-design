import {
  HISTORY_ACTION_MAX,
  HISTORY_MAX,
  HISTORY_NOTE_MAX,
  type OperatorGuidanceDto,
  type PageObservation,
  type SessionRailsDto,
  type StepAction,
  type StepHistoryEntry,
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
  tasks: { open: OpenTask | null; started: number; done: number; skipped: number; failed: number };
  consecutiveFailures: number;
  brainFaults: number;
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
    tasks: { open: null, started: 0, done: 0, skipped: 0, failed: 0 },
    consecutiveFailures: 0,
    brainFaults: 0,
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
  operatorStopped: state.operatorStopped,
});

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

export function pushHistory(
  state: SessionState,
  action: string,
  outcome: StepHistoryEntry['outcome'],
  note: string | null,
): void {
  state.history.push({
    action: clip(action, HISTORY_ACTION_MAX),
    outcome,
    note: note === null ? null : clip(note, HISTORY_NOTE_MAX),
  });
  if (state.history.length > HISTORY_MAX)
    state.history.splice(0, state.history.length - HISTORY_MAX);
}

const named = (ref: string, observation: PageObservation): string => {
  const element = observation.elements.find((candidate) => candidate.ref === ref);
  return element === undefined ? ref : `${ref} ${element.role} ${quote(element.name)}`;
};

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
    case 'taskDone':
      return `taskDone ${action.outcome}${action.detail ? ` — ${action.detail}` : ''}`;
    case 'terminate':
      return `terminate ${action.cause} — ${action.detail}`;
    case 'done':
      return 'done';
  }
}
