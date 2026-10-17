import {
  OBJECTIONS_MAX,
  SETTLING_CRITERION_KINDS,
  type CallHistoryEntry,
  type Objection,
  type RanCall,
  type StepRecord,
  type SuccessCriterion,
  type ToolObservation,
  type ToolSessionEnding,
  type ToolSessionRecord,
} from '@sysdesign/contracts';

import type { RailsSettings, ToolSessionSettings } from '../settings';
import { freshCounters, type RailCounters } from './rails';

/** What a session is run over: its record, the rails for this one, the program's settings, and its stop. */
export interface SessionInput {
  record: ToolSessionRecord;
  rails: RailsSettings;
  settings: ToolSessionSettings;
  signal: AbortSignal;
}

/** What the loop keeps between steps, bounded as the settings say. */
export interface LoopState {
  observations: ToolObservation[];
  /** How many of the oldest observations the window left out, counted into the goal. */
  droppedObservations: number;
  history: CallHistoryEntry[];
  objections: Objection[];
  settled: string[];
  lastStep: { ran: number; calls: RanCall[] } | null;
  counters: RailCounters;
}

export const freshState = (): LoopState => ({
  observations: [],
  droppedObservations: 0,
  history: [],
  objections: [],
  settled: [],
  lastStep: null,
  counters: freshCounters(),
});

/** How a step ended: the session goes on, or it ended for the reason given. */
export type StepOutcome = 'continue' | ToolSessionEnding;

export const describeError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** The newest objections first, the oldest past the declared count dropped. */
export function pushObjections(state: LoopState, objections: readonly Objection[]): void {
  state.objections = [...objections, ...state.objections].slice(0, OBJECTIONS_MAX);
}

/** One more observation, the oldest past the window counted rather than kept. */
export function pushObservation(
  state: LoopState,
  settings: ToolSessionSettings,
  observation: ToolObservation,
): void {
  state.observations.push(observation);
  while (state.observations.length > settings.observations.keep) {
    state.observations.shift();
    state.droppedObservations += 1;
  }
}

export function pushHistory(
  state: LoopState,
  settings: ToolSessionSettings,
  entry: CallHistoryEntry,
): void {
  state.history.push(entry);
  while (state.history.length > settings.history.keep) state.history.shift();
}

/** The criteria the evaluator passed on a plan that ran whole, of the kinds a session settles. */
export function settle(
  state: LoopState,
  criteria: readonly SuccessCriterion[],
  passed: readonly string[],
): void {
  for (const id of passed) {
    const criterion = criteria.find((each) => each.id === id);
    if (criterion === undefined || state.settled.includes(id)) continue;
    if ((SETTLING_CRITERION_KINDS as readonly string[]).includes(criterion.kind)) {
      state.settled.push(id);
    }
  }
}

/** A step's record before anything ran: what was asked of the loop, and what went wrong if nothing came back. */
export const emptyStep = (
  step: number,
  loopRunId: string | null,
  composition: StepRecord['composition'],
  fault: string | null,
): StepRecord => ({
  step,
  loopRunId,
  finalDecision: null,
  executable: false,
  executePrefix: 0,
  calls: [],
  ask: null,
  finish: null,
  objections: [],
  composition,
  fault,
});
