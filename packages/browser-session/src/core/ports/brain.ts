import type {
  Objection,
  Admission,
  AnswerSuggestions,
  BrowserSessionRole,
  FieldAnswers,
  FieldSpec,
  LastStep,
  OperatorGuidanceDto,
  PageObservation,
  QualityRunDto,
  SnapshotRung,
  StepHistoryEntry,
  StepPlan,
  SuccessCriterion,
  TaskLedgerSummary,
  UnitsOnRecord,
  WithheldRef,
  WriteOutcome,
} from '@sysdesign/contracts';

import type { FormTask } from '../open-unit';

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

/** A rubric derived from the mission, the pipeline it was derived for, and the loop's dump of the derivation — null when none was written. */
export interface DerivedRubric {
  pipeline: string;
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
  /** The rubric for the pipeline that plays one role in the session, derived from the mission alone. */
  deriveRubric(role: BrowserSessionRole, goal: string): Promise<DerivedRubric>;
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
