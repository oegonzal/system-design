import type {
  StepObjection,
  Admission,
  BrowserDecisionKind,
  BrowserDecisionSource,
  BrowserSessionDetailDto,
  BrowserSessionDto,
  BrowserSessionStatus,
  BrowserSessionTermination,
  BrowserTaskStatus,
  ConfidenceLevel,
  DocumentChunk,
  FieldAnswers,
  FieldSpec,
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
} from '@sysdesign/contracts';
import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';

/**
 * The ports the session engine drives. The engine is pure over these: a
 * browser that observes and acts, a brain that is the quality loop, a ledger
 * for the records, an operator at a terminal, a goal to read, a clock and a
 * dump to write. Every adapter lives under `adapters/`; every fake under
 * `core/testing.ts`; nothing here names a site, a database or a model.
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
  /** Throws `ActionFailed`. */
  act(action: BrowserAction): Promise<void>;
  /** Mark a field for the operator's eye. */
  highlight(ref: string): Promise<void>;
  /** What the field holds now — what the operator typed into the page — or null when unreadable. */
  readValue(ref: string): Promise<string | null>;
  screenshot(): Promise<Uint8Array>;
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

export interface StepInput {
  mission: string;
  observation: PageObservation;
  history: readonly StepHistoryEntry[];
  ledger: TaskLedgerSummary;
  /** Why the plans before this one did not run, newest first. */
  objections: readonly StepObjection[];
  criteria: readonly SuccessCriterion[];
  /**
   * Whether this page is the one the last plan was made against. On an
   * unchanged page there is no fresh observation to beat a revise, so the
   * brain asks the loop for a second iteration from its own briefing.
   */
  pageUnchanged: boolean;
  /** The criteria settled for the session, which the run's rubric omits, and those done in the open unit, which it keeps. */
  progress: { settled: readonly string[]; done: readonly string[] };
}

export interface FieldsInput {
  mission: string;
  task: { label: string; url: string } | null;
  fields: readonly FieldSpec[];
  criteria: readonly SuccessCriterion[];
}

export interface BrainPort {
  /** The rubric for one pipeline, derived from the mission alone. */
  deriveRubric(pipeline: string, goal: string): Promise<SuccessCriterion[]>;
  planStep(input: StepInput): Promise<Decided<StepPlan>>;
  answerFields(input: FieldsInput): Promise<Decided<FieldAnswers> & { admission: Admission }>;
  /** Hand a document to the memory; answers as soon as the orchestration is open. */
  teach(document: DocumentChunk): Promise<{ orchestrationRunId: string }>;
}

// ---- the ledger ---------------------------------------------------------------

export interface Termination {
  reason: BrowserSessionTermination;
  detail: string;
}

export interface NewSession {
  id: string;
  dumpRunId: string;
  goalPath: string;
  goalHash: string;
  goalMarkdown: string;
  profile: string;
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
  confidence: ConfidenceLevel | null;
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
  /** The teaching orchestration, written onto exactly the decision rows whose answers the document carried. */
  recordTeaching(decisionIds: readonly string[], orchestrationRunId: string): Promise<void>;
  closeSession(sessionId: string, close: SessionClose): Promise<void>;
  listSessions(limit: number): Promise<BrowserSessionDto[]>;
  getSession(id: string): Promise<BrowserSessionDetailDto | null>;
}

// ---- the operator -------------------------------------------------------------

export interface OperatorPrompt {
  field: FieldSpec;
  /** The model's value, offered for the operator to accept or replace; null when it gave none. */
  suggestion: string | null;
  /** Why the suggestion was not trusted: the route's reason and what a judge or validator said. */
  why: string;
  task: string | null;
  page: string;
}

export type OperatorReply =
  { kind: 'answer'; text: string } | { kind: 'read-back' } | { kind: 'blank' } | { kind: 'stop' };

export interface OperatorPort {
  ask(prompt: OperatorPrompt): Promise<OperatorReply>;
  notify(text: string): void;
  /** Say something and wait for the operator to go on. */
  pause(text: string): Promise<void>;
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
