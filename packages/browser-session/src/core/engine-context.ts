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
import { causeOf } from './ports';
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
  /** Where to open the browser before the first plan; unset leaves it on about:blank. */
  startUrl?: string;
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

/** What the runner opened before the flows run: the state, the goal's text, the dump and the queue. */
export interface EngineParts {
  deps: SessionDeps;
  options: RunSessionOptions;
  state: SessionState;
  mission: string;
  dump: DumpSink;
  queue: WriteQueue;
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
    criteria: { plan: [], answer: [] },
    record(decision) {
      state.ordinal += 1;
      state.decisions += 1;
      const row = {
        ...decision,
        id: crypto.randomUUID(),
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
        confidence: null,
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
