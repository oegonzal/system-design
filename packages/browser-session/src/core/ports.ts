import type {
  Objection,
  Admission,
  AnswerSuggestions,
  BrowserDecisionKind,
  BrowserDecisionSource,
  BrowserSessionDetailDto,
  BrowserSessionDto,
  BrowserSessionStatus,
  EngineTermination,
  BrowserTaskStatus,
  AnswerBasis,
  FieldAnswers,
  FieldSpec,
  InteractionAnswer,
  InteractionPrompt,
  InteractionWithdrawn,
  LandmarkRole,
  LastStep,
  OperatorGuidanceDto,
  PageObservation,
  QualityRunDto,
  SessionRailsDto,
  SnapshotRung,
  StepAction,
  StepHistoryEntry,
  StepPlan,
  SuccessCriterion,
  TaskLedgerSummary,
  TaskOutcome,
  StopEnding,
  UnitFacet,
  UnitsOnRecord,
  WithheldRef,
  WriteOutcome,
} from '@sysdesign/contracts';
import { MISSION_STOP } from '@sysdesign/contracts';
import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';

import type { FormTask } from './open-unit';

/**
 * The ports the session engine drives. The engine is pure over these: a
 * browser that observes and acts, a brain that decides through the quality
 * loop and keeps the operator's answers wherever it is bound to, a ledger
 * for the records, an operator at a terminal, a goal to read, a clock and a
 * dump to write, and the operator's interrupt. The advisor and the session
 * events ports live beside their flows, in `unit-advice.ts` and
 * `session-events.ts`. Every adapter lives under `adapters/`; every fake under
 * `core/testing*.ts`; nothing here names a site, a database or a model.
 */

// ---- the browser ------------------------------------------------------------

/** The plan actions a browser performs; the rest are the engine's own events. */
export const BROWSER_ACTION_KINDS = [
  'navigate',
  'click',
  'fill',
  'select',
  'press',
  'scroll',
  'waitFor',
] as const;
export type BrowserActionKind = (typeof BROWSER_ACTION_KINDS)[number];
export type BrowserAction = Extract<StepAction, { kind: BrowserActionKind }>;

export const isBrowserAction = (action: StepAction): action is BrowserAction =>
  (BROWSER_ACTION_KINDS as readonly string[]).includes(action.kind);

/** An action the page refused: a stale ref, a missing element, a timeout. */
export class ActionFailed extends Error {
  override readonly name = 'ActionFailed';
  constructor(
    readonly action: string,
    detail: string,
  ) {
    super(`${action}: ${detail}`);
  }
}

export interface BrowserPort {
  open(profile: string, options: { headed: boolean }): Promise<void>;
  /** The page as it is now; the refs it lists resolve only until the next `observe`. */
  observe(): Promise<PageObservation>;
  /** What the page the last `observe` read states inside one landmark — each node's words in document order, from that observation's tree, never a new read; none when it lays out no such landmark. */
  wordsUnder(landmark: LandmarkRole): readonly string[];
  /** Throws `ActionFailed`. */
  act(action: BrowserAction): Promise<void>;
  /** Mark a field for the operator's eye. */
  highlight(ref: string): Promise<void>;
  /** What the field holds now — what the operator typed into the page — or null when unreadable. */
  readValue(ref: string): Promise<string | null>;
  /**
   * The page as an image, with the element `outline` names marked while it is
   * taken and unmarked after; null marks nothing, and an element that is gone
   * leaves the image unmarked rather than failing it.
   */
  screenshot(outline: string | null): Promise<Uint8Array>;
  close(): Promise<void>;
}

// ---- the brain --------------------------------------------------------------

/**
 * Why the brain gave no decision; `goal-budget` is the one fault that is the
 * page's size, not the loop's. An artifact that does not parse is not a
 * fault: the run exists and is read back as not executable by the contracts.
 */
export const BRAIN_FAULT_REASONS = [
  'failed',
  'lost',
  'stale',
  'unreachable',
  'no-artifact',
  'goal-budget',
] as const;
export type BrainFaultReason = (typeof BRAIN_FAULT_REASONS)[number];

export class BrainFaulted extends Error {
  override readonly name = 'BrainFaulted';
  constructor(
    readonly reason: BrainFaultReason,
    detail: string,
  ) {
    super(`brain ${reason}: ${detail}`);
  }
}

/**
 * How the goal was fitted to the loop's budget: which rung of the ladder, how
 * big it came out, and which rung the snapshot in it is at — null for a goal
 * that carries no snapshot section.
 */
export interface GoalComposition {
  rung: string;
  bytes: number;
  snapshotRung: SnapshotRung | null;
}

/**
 * A decision the loop recorded: the run, read back through the contracts'
 * route tables, and how the goal was composed. The type parameter names what
 * the run's artifact is, so a plan and a set of answers cannot be confused;
 * the artifact itself is read from the run, never carried beside it.
 */
export interface Decided<T> {
  runId: string;
  /** The orchestration that ran the deciding run, when one did. */
  orchestrationRunId: string | null;
  run: QualityRunDto;
  composition: GoalComposition;
  /** Compile-time only: the artifact kind the run decided. */
  readonly decides?: T;
}

/**
 * The session and step a decision is asked in. The loop records it as who
 * opened the run, so a session's runs can be listed together, and reads it
 * for nothing else.
 */
export interface SessionStepRef {
  sessionId: string;
  step: number;
}

export interface StepInput {
  session: SessionStepRef;
  mission: string;
  observation: PageObservation;
  history: readonly StepHistoryEntry[];
  ledger: TaskLedgerSummary;
  /** Why the plans before this one did not run, newest first. */
  objections: readonly Objection[];
  criteria: readonly SuccessCriterion[];
  /**
   * Whether this page is the one the last plan was made against. On an
   * unchanged page there is no fresh observation to beat a revise, so the
   * brain asks the loop for a second iteration from its own briefing.
   */
  pageUnchanged: boolean;
  /**
   * What the last step did — how many actions ran, what they touched, what
   * was held past them — or null before the first plan. The goal tells the
   * next plan what led to this page from it, and a last step that ran nothing
   * on an unchanged page is when the brain asks for a second iteration.
   */
  lastStep: LastStep | null;
  /** The criteria settled for the session, which the run's rubric omits, and those done in the open unit, which it keeps. */
  progress: { settled: readonly string[]; done: readonly string[] };
  /** The units an advisor put on record from earlier sessions; none when no advisor was asked. */
  onRecord: UnitsOnRecord;
}

/**
 * What the recall behind a form run did, as the brain reports it: how many
 * requests it made, how many items of evidence reached the goal, how long it
 * took, the fault that stopped it when one did, and what it passed over,
 * named one by one in the brain's words. Null from a brain whose recall is
 * the loop's own, read from the run.
 */
export interface RecallReport {
  requests: number;
  evidence: number;
  latencyMs: number;
  fault: string | null;
  skipped: string[];
}

/** What the brain reports of the run it opened for a form: its admission, the locations a reader withholds, each with what withheld it and why, and what its recall did. */
export interface FormReport {
  admission: Admission;
  withheld: readonly WithheldRef[];
  recall: RecallReport | null;
}

export interface FieldsInput {
  session: SessionStepRef;
  mission: string;
  task: FormTask | null;
  fields: readonly FieldSpec[];
  criteria: readonly SuccessCriterion[];
}

/** A rubric derived from the mission, and the loop's dump of the derivation — null when none was written. */
export interface DerivedRubric {
  criteria: SuccessCriterion[];
  dumpRunId: string | null;
}

/**
 * What the memory did with one answer handed to it: where the teaching can
 * be found again — the orchestration the loop digests it on when `queued`,
 * the record's reference once written, nothing when `refused` — what the
 * write did, in the memory's own words, and the fault that stood in the way,
 * null when none did. One reference, so a decision row carries exactly the
 * record or orchestration its own answer went to.
 */
export interface TeachReceipt {
  ref: string | null;
  outcome: WriteOutcome | 'queued' | 'refused';
  fault: string | null;
}

export interface BrainPort {
  /**
   * Bind to whatever the brain keeps its memories in, before any session row
   * is written: a brain that keeps them in a space is refused here by name —
   * a tenant nobody chose, a space that does not serve it — as a bad flag is;
   * one that keeps none does nothing. Called once by whoever runs a session
   * or teaches through the brain, never by a command that only reads.
   */
  bind(): Promise<void>;
  /** The rubric for one pipeline, derived from the mission alone. */
  deriveRubric(pipeline: string, goal: string): Promise<DerivedRubric>;
  planStep(input: StepInput): Promise<Decided<StepPlan>>;
  answerFields(input: FieldsInput): Promise<Decided<FieldAnswers> & FormReport>;
  /** A few suggested answers for fields the operator is about to be asked, judged once. */
  suggestAnswers(input: FieldsInput): Promise<Decided<AnswerSuggestions> & FormReport>;
  /**
   * Hand the operator's answers to the memory as the subject's own, and
   * answer what it did with each, one receipt per answer in the answers'
   * order: a brain that digests them on the loop answers as soon as the
   * orchestration is open, one that writes them answers once they are
   * written. A refusal of one answer is that answer's receipt and stops none
   * of the others.
   */
  teach(
    answers: readonly OperatorGuidanceDto[],
    session: SessionStepRef,
    subject: string,
  ): Promise<readonly TeachReceipt[]>;
}

// ---- the ledger ---------------------------------------------------------------

/**
 * How a session ended: by a rail, the operator or a fault, each the engine's
 * own word; or by a stop its mission declares — which one, by the mission's
 * cause word, and the status the mission says it leaves the session in.
 */
export type Termination =
  | { reason: EngineTermination; detail: string }
  | { reason: typeof MISSION_STOP; cause: string; ending: StopEnding; detail: string };

/** The mission's cause word when one of its stops ended the session; null for any other end. */
export const causeOf = (termination: Termination): string | null =>
  termination.reason === MISSION_STOP ? termination.cause : null;

export interface NewSession {
  id: string;
  dumpRunId: string;
  goalPath: string;
  goalHash: string;
  goalMarkdown: string;
  profile: string;
  /** Whom the session acts for, by name: the partition every record beyond the session is kept under. */
  subject: string;
  headed: boolean;
  limits: SessionRailsDto;
  startedAt: Date;
}

export interface NewTask {
  id: string;
  sessionId: string;
  ordinal: number;
  label: string;
  externalRef: string | null;
  /** The unit's identity as the plan declared it. */
  facets: readonly UnitFacet[];
  startStep: number;
  startedAt: Date;
}

export interface TaskClose {
  status: BrowserTaskStatus;
  outcome: TaskOutcome;
  endStep: number;
  finishedAt: Date;
}

export interface NewDecision {
  id: string;
  sessionId: string;
  taskId: string | null;
  step: number;
  ordinal: number;
  kind: BrowserDecisionKind;
  source: BrowserDecisionSource;
  loopRunId: string | null;
  loopOrchestrationId: string | null;
  ref: string | null;
  question: string | null;
  answer: string | null;
  /** How a field answer's value rests on the evidence, as declared; null for anything else. */
  rests: AnswerBasis | null;
  payload: Record<string, unknown>;
  durationMs: number | null;
  createdAt: Date;
}

export interface SessionClose {
  status: BrowserSessionStatus;
  termination: Termination;
  steps: number;
  finishedAt: Date;
  error: { name: string; message: string } | null;
}

/**
 * The records. Ids are minted by the engine, so every write can be queued
 * without awaiting the one before it; the adapter never invents one.
 */
export interface LedgerPort {
  openSession(session: NewSession): Promise<void>;
  recordCriteria(sessionId: string, criteria: Record<string, SuccessCriterion[]>): Promise<void>;
  heartbeat(sessionId: string, at: Date, steps: number): Promise<void>;
  openTask(task: NewTask): Promise<void>;
  closeTask(taskId: string, close: TaskClose): Promise<void>;
  recordDecision(decision: NewDecision): Promise<void>;
  /** The reference the teaching left (an orchestration id today, a memory record id under a memory-backed brain), written onto exactly the decision rows whose answers it carried. */
  recordTeaching(decisionIds: readonly string[], ref: string): Promise<void>;
  closeSession(sessionId: string, close: SessionClose): Promise<void>;
  /**
   * Every session still `running` whose beat is older than `before` closed
   * as interrupted, finished at its last beat; how many. A live session beats
   * well inside the window and is never touched; a close that later arrives
   * from a stopped process overwrites the row with what ended it.
   */
  failStale(before: Date): Promise<number>;
  listSessions(limit: number): Promise<BrowserSessionDto[]>;
  getSession(id: string): Promise<BrowserSessionDetailDto | null>;
}

// ---- the operator -------------------------------------------------------------

/**
 * A question put to the operator, the same on every channel: the prompt the
 * notifications contracts describe — lettered choices, free text within a
 * length, slash commands — and what a bare Enter means at the terminal.
 */
export interface OperatorQuestion {
  prompt: InteractionPrompt;
  /** The command an empty line at the terminal stands for; null when it stands for none. */
  enter: string | null;
}

/** Why a question is withdrawn from a channel, as an abort carries it: `controller.abort(withdrawal)`. */
export type Withdrawal = Omit<InteractionWithdrawn, 'promptId'>;

/** One way to reach the operator: it asks, and answers with what the person chose, typed or commanded. */
export interface OperatorChannel {
  readonly name: string;
  /**
   * Rejects with `QuestionWithdrawn` once the signal aborts, after showing
   * the withdrawal the abort carries where the question was asked.
   */
  ask(question: OperatorQuestion, signal?: AbortSignal): Promise<InteractionAnswer>;
  /** The answer this channel gave raced another and was not the one taken: show that where it was given. */
  unused(question: OperatorQuestion, withdrawal: Withdrawal): Promise<void>;
}

/** The operator: asked on every channel, and told what the session is doing where a person reads it. */
export interface OperatorPort extends OperatorChannel {
  notify(text: string): void;
}

/** A channel's ask that ended because the question was withdrawn from it — never a failure of the channel. */
export class QuestionWithdrawn extends Error {
  override readonly name = 'QuestionWithdrawn';
  constructor(channel: string) {
    super(`the question was withdrawn from ${channel}`);
  }
}

/** The operator stopped a question at the terminal — Ctrl-C — rather than answer it. */
export class OperatorInterrupted extends Error {
  override readonly name = 'OperatorInterrupted';
  constructor() {
    super('interrupted at the terminal');
  }
}

// ---- the goal, the clock, the dump ------------------------------------------------

export interface GoalDocument {
  path: string;
  markdown: string;
  /** sha256 of the markdown. */
  hash: string;
}

export interface GoalSource {
  read(path: string): Promise<GoalDocument>;
}

export interface Clock {
  now(): Date;
  /**
   * Runs `then` once, when `when` has come as this clock tells time; the
   * function returned cancels it. How the session's time limit reaches a step
   * waiting on the operator: the rails are read between steps, and a step
   * blocked on a question has no between.
   */
  at(when: Date, then: () => void): () => void;
}

/** One session's dump folder: files land as they come, the index row once at the end. */
export interface DumpSink {
  runId: string;
  write(files: readonly (DumpFile | DumpBytes)[]): void;
  index(row: string): void;
}

export interface DumpStore {
  open(now: Date): DumpSink;
}

// ---- the operator's interrupt ---------------------------------------------------

/**
 * Ctrl-C as the operator's word, through a port: the engine ends the session
 * after the step in flight, through every closing write, and a spec can press
 * it. How a second press is handled is the adapter's.
 */
export interface StopSignal {
  /** Calls the handler when the operator asks the process to stop; answers how to stop listening. */
  onStop(handler: () => void): () => void;
}
