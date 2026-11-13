import type {
  AnsweringSettings,
  BrowserSessionRole,
  SessionRailsDto,
  SuccessCriterion,
  WriteQueue,
} from '@sysdesign/contracts';
import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';

import type {
  BrainPort,
  BrowserActionKind,
  BrowserPort,
  Clock,
  DumpSink,
  DumpStore,
  GoalSource,
  Ids,
  LedgerPort,
  LoopProbe,
  NewDecision,
  OperatorPort,
  SessionFiles,
  StopSignal,
  Termination,
  SuppliedDocument,
} from './ports';
import type { SessionLiveness } from './liveness';
import { causeOf } from './ports';
import type { StepFailureEvent } from './rails';
import type { SessionEvents, SessionEventsPort } from './session-events';
import type { SessionState } from './session-state';
import type { ConfiguredAdvisor, ResolvedAdvisor } from './unit-advice';

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
  ids: Ids;
  dumps: DumpStore;
  /** Every advisor the environment configures; the mission names which to ask. */
  advisors: readonly ConfiguredAdvisor[];
  /** Where the session says what happened, for whoever keeps a record of its units beyond it. */
  events: SessionEventsPort;
  stop: StopSignal;
  /** The profile, its exported sign-in and the documents, wherever they live beyond this machine. */
  files: SessionFiles;
  /** The loop, asked whether it is there when a session is told to wait for it. */
  loop: LoopProbe;
  /** A write that did not land, a beat that was missed: reported, never thrown. */
  warn(text: string): void;
  log(text: string): void;
}

/**
 * What a session leaves as images beside each step's own screenshot: the
 * browser actions captured once they ran, and whether one the page refused is.
 */
export interface CapturePolicy {
  after: readonly BrowserActionKind[];
  failures: boolean;
}

export interface RunSessionOptions {
  goalPath: string;
  profile: string;
  headed: boolean;
  rails: SessionRailsDto;
  /** Whom the operator's answers are about, by name. */
  subject: string;
  /** Whether the subject was given for this run, or is the configured fallback — a record is kept by subject, so an advisor is refused without one. */
  subjectDeclared: boolean;
  /** How long the close waits for the session's events to publish, in all: the bus recovery window, so a bus down for the window costs one window, not one per event. */
  eventsDrainMs: number;
  /** How often the session beats, and how long a silence the start-of-session sweep takes for death. */
  liveness: SessionLiveness;
  /** Where to open the browser before the first plan; unset leaves it on about:blank. */
  startUrl?: string;
  /** The files the run supplies for the documents the mission declares, by name; handed to the browser, read by nothing else. */
  documents: readonly SuppliedDocument[];
  capture: CapturePolicy;
  /** How long a question stays offered on a channel that honours expiry, should the session never withdraw it. */
  questionExpiresAfterMs: number;
  /** How many times a question is put back once the page refused the operator's answer to it. */
  asksAfterRefusal: number;
  /** The channels whose answers are kept for the session alone, by the id each answer carries; every other channel's answers are taught. */
  untaught: readonly string[];
  /** Which kinds of evidence-backed value are typed without asking the operator, by the kind each answer declares. */
  answering: AnsweringSettings;
  /** The settings files in force, by kind, as the manifest records them. */
  settingsSources: Readonly<Record<string, string>>;
  /** How many minutes the session waits for the loop to answer before it binds; 0 binds at once. */
  waitForLoopMinutes: number;
}

/** The rubric derived once per session, by the role each pipeline plays. */
export type SessionCriteria = Record<BrowserSessionRole, SuccessCriterion[]>;

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
  /** The advisors the mission named, resolved before the session opened. */
  advisors: ResolvedAdvisor[];
  events: SessionEvents;
  /** Aborted, with the withdrawal, the moment the operator tells the session to stop: a question waiting on them is withdrawn, and none is asked after. */
  stopping: AbortSignal;
  /** Told when a unit of work closes: one closed past the time limit leaves the session out of time at once, so nothing after it waits on the operator. */
  unitClosed(): void;
  /** Queue one decision row for the current step; answers its id. */
  record(decision: DecisionInput): string;
  /** Queue dump files; a write that fails is reported under `what`. */
  dumpFiles(what: string, files: readonly (DumpFile | DumpBytes)[]): void;
  /** One of the declared failure events happened this step. */
  fail(event: StepFailureEvent): void;
  /** The termination is decided: record it against the run that decided it, or the engine. */
  terminate(termination: Termination, source: 'loop' | 'engine', runId: string | null): Termination;
}

/** What the runner opened before the flows run: the state, the goal's text, the dump and the queue. */
export interface EngineParts {
  deps: SessionDeps;
  options: RunSessionOptions;
  state: SessionState;
  mission: string;
  dump: DumpSink;
  queue: WriteQueue;
  advisors: ResolvedAdvisor[];
  events: SessionEvents;
  stopping: AbortSignal;
  unitClosed(): void;
}

/**
 * The context the step and field flows share: the parts the runner opened,
 * and the four things a flow does to the record — queue a decision row for
 * the current step, queue dump files, count a declared failure, and record
 * the termination against whoever decided it.
 */
export function createEngineContext(parts: EngineParts): EngineContext {
  const { deps, state, dump, queue } = parts;
  const ctx: EngineContext = {
    ...parts,
    criteria: { plan: [], answer: [], suggest: [] },
    record(decision) {
      state.ordinal += 1;
      state.decisions += 1;
      const row = {
        ...decision,
        id: deps.ids(),
        sessionId: state.sessionId,
        taskId: state.tasks.open?.id ?? null,
        step: state.step,
        ordinal: state.ordinal,
        createdAt: deps.clock.now(),
      };
      queue.write(`decision ${row.step}.${row.ordinal}`, () => deps.ledger.recordDecision(row));
      return row.id;
    },
    dumpFiles(what, files) {
      queue.write(`dump ${what}`, async () => dump.write(files));
    },
    fail(event) {
      state.consecutiveFailures += 1;
      deps.log(`step ${state.step}: ${event} (${state.consecutiveFailures} in a row)`);
    },
    terminate(termination, source, runId) {
      ctx.record({
        kind: 'termination',
        source,
        loopRunId: runId,
        loopOrchestrationId: null,
        ref: null,
        question: null,
        answer: null,
        rests: null,
        durationMs: null,
        payload: {
          reason: termination.reason,
          cause: causeOf(termination),
          detail: termination.detail,
        },
      });
      state.terminationRecorded = true;
      return termination;
    },
  };
  return ctx;
}
