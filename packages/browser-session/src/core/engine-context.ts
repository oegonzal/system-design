import type { SessionRailsDto, SuccessCriterion } from '@sysdesign/contracts';
import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';

import type {
  BrainPort,
  BrowserPort,
  Clock,
  DumpSink,
  DumpStore,
  GoalSource,
  LedgerPort,
  NewDecision,
  OperatorPort,
  Termination,
} from './ports';
import type { StepFailureEvent } from './rails';
import type { SessionState } from './session-state';
import type { WriteQueue } from './write-queue';

/**
 * What the engine is given, what it was asked, and what its step and field
 * flows share while it runs. Declared apart from the loop so the flows can
 * be read — and specced — one at a time.
 */
export interface SessionDeps {
  browser: BrowserPort;
  brain: BrainPort;
  ledger: LedgerPort;
  operator: OperatorPort;
  goals: GoalSource;
  clock: Clock;
  dumps: DumpStore;
  /** A write that did not land, a beat that was missed: reported, never thrown. */
  warn(text: string): void;
  log(text: string): void;
}

export interface RunSessionOptions {
  goalPath: string;
  profile: string;
  headed: boolean;
  rails: SessionRailsDto;
  /** Whom the operator's answers are about, by name. */
  subject: string;
}

/** The rubric derived once per session, by the role each pipeline plays. */
export interface SessionCriteria {
  plan: SuccessCriterion[];
  answer: SuccessCriterion[];
}

/** A decision as the flows record it: the engine fills in the ids, the step and the ordinal. */
export type DecisionInput = Omit<
  NewDecision,
  'id' | 'sessionId' | 'taskId' | 'step' | 'ordinal' | 'createdAt'
>;

export interface EngineContext {
  deps: SessionDeps;
  options: RunSessionOptions;
  state: SessionState;
  mission: string;
  criteria: SessionCriteria;
  queue: WriteQueue;
  dump: DumpSink;
  /** Queue one decision row for the current step; answers its id. */
  record(decision: DecisionInput): string;
  /** Queue dump files; a write that fails is reported under `what`. */
  dumpFiles(what: string, files: readonly (DumpFile | DumpBytes)[]): void;
  /** One of the declared failure events happened this step. */
  fail(event: StepFailureEvent): void;
  /** The termination is decided: record it against the run that decided it, or the engine. */
  terminate(termination: Termination, source: 'loop' | 'engine', runId: string | null): Termination;
}
