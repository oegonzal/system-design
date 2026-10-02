import type {
  ArtifactLocation,
  CriticReport,
  Decision,
  Diagnostic,
  EvaluationReport,
  EvidenceLedger,
  IsoDateString,
  IterationMode,
  Lesson,
  LlmExchangeSummaryDto,
  LlmModelDto,
  OrchestrationStepStatus,
  QualityControlDecision,
  QualityRunRequestSummary,
  QualityRunStatus,
  RemediationNote,
  RunErrorDto,
  StopReason,
  SuccessCriterion,
  ValidationReport,
} from '@sysdesign/contracts';

/**
 * The loop's working memory, as the engine carries it.
 *
 * This is deliberately NOT a tree of the whole run. Iteration 2's ledger
 * overwrites iteration 1's at the same path, so "criterion c2 went fail →
 * pass" is one updated row. A state keyed by iteration would turn the same
 * transition into two unrelated additions, and the one comparison most worth
 * seeing would be the one the tool could not show.
 *
 * Two shape rules carry most of the robustness:
 *
 * - **Keyed objects, not arrays, wherever identity is a string** (`steps`,
 *   `lenses.critics`, `lenses.evaluators`). The diff is then a plain property
 *   add or update and needs no array matching at all. Arrays survive only
 *   where the wire's order is itself the meaning: the rubric, the decision's
 *   gate ladder, the exchange log.
 * - **Beginning an iteration clears nothing.** A reset would make every
 *   per-iteration comparison a delete followed by an insert.
 *
 * Because nothing is cleared, a lens cell carries the `iteration` it came
 * from: a lens that did not report again is then visibly stale rather than
 * silently passed off as current.
 */

/** One lens sample's contribution: what it answered, or why it answered nothing. */
export interface LensCell {
  /** The lens id — `critic.grounding`, `evaluator.requirements`. */
  lens: string;
  kind: 'critic' | 'evaluator';
  /** 1-based within the lens; null for a lens that could not run at all. */
  sample: number | null;
  /** The iteration this cell was last written by. */
  iteration: number;
  report: CriticReport | EvaluationReport | null;
  diagnostic: Diagnostic | null;
}

/**
 * The header of the quality run being read — every field of it immutable, so
 * the action that announces it is written once and never corrected.
 */
export interface RunHeader {
  runId: string;
  pipeline: string;
  startedAt: IsoDateString;
  llm: LlmModelDto;
  request: QualityRunRequestSummary;
}

/**
 * What the run is being judged against: the goal, the rubric every lens cites,
 * and the pipeline version that recorded them. The version lives here rather
 * than on the header because the wire only carries it with the trace, and it
 * means the same thing the rubric does — which contract this grade was made
 * under.
 */
export interface ContractState {
  goal: string;
  criteria: SuccessCriterion[];
  /** How the rubric came to be: derived from the goal, supplied, or adopted with an iteration. */
  source: 'derived' | 'provided' | 'adopted' | null;
  pipelineVersion: string | null;
}

/** Which iteration is being read, and how it came by its artifact. */
export interface IterationState {
  number: number;
  mode: IterationMode;
  durationMs: number | null;
}

export interface ArtifactState {
  mode: IterationMode;
  /** The text every judge read. Null when the pipeline renders nothing. */
  rendered: string | null;
  locations: ArtifactLocation[];
  /** The pipeline's own artifact shape — unknowable to this client, diffed by position. */
  value: unknown;
}

/**
 * Where the run stands after the iterations recorded so far. Every judgement
 * is nullable because a run that failed before its first iteration has a
 * status and nothing else — the failure itself is a field of its own, so there
 * is never a reason to invent a best iteration to hang it on.
 */
export interface StandingState {
  status: QualityRunStatus;
  finishedAt: IsoDateString | null;
  bestIteration: number | null;
  finalDecision: Decision | null;
  /** Null while the loop still runs, and on a run that failed before choosing to stop. */
  stopReason: StopReason | null;
  lessons: Lesson[];
}

/**
 * One step of an orchestration, minus its children. The step's own fields and
 * the children it opened change for different reasons and at different moments,
 * so they are carried by different actions: this row is what the step reports
 * about itself.
 */
export interface StepRow {
  stepId: string;
  status: OrchestrationStepStatus;
  reason: string | null;
  note: string | null;
  counts: Record<string, number>;
  /** The orchestrator's own shape — unknowable to this client, diffed by position. */
  report: Record<string, unknown> | null;
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
}

/** A step as the state holds it: its own row, plus the child runs it has opened. */
export interface StepState extends StepRow {
  /** The child quality runs, in the order they opened. */
  runIds: string[];
}

export interface OrchestrationState {
  orchestrationRunId: string;
  orchestrator: string;
  /** The pipeline the request named as the target, when the orchestrator takes one. */
  pipeline: string | null;
  startedAt: IsoDateString;
  finishedAt: IsoDateString | null;
  status: QualityRunStatus;
  /** What the orchestrator observed at open — availability, mostly. Its own shape. */
  context: Record<string, unknown>;
  /** Keyed by step id, in declared order as the record lists them. */
  steps: Record<string, StepState>;
  error: RunErrorDto | null;
}

export interface InspectorState {
  orchestration: OrchestrationState | null;
  run: RunHeader | null;
  contract: ContractState;
  iteration: IterationState | null;
  artifact: ArtifactState | null;
  validation: ValidationReport[];
  lenses: {
    critics: Record<string, LensCell>;
    evaluators: Record<string, LensCell>;
  };
  ledger: EvidenceLedger;
  decision: QualityControlDecision | null;
  remediations: RemediationNote[];
  standing: StandingState | null;
  /** Why the run threw, when it did. Independent of the standing it never reached. */
  failure: RunErrorDto | null;
  exchanges: LlmExchangeSummaryDto[];
}

/** An empty ledger — the shape `decide` would see before anything normalised. */
export const emptyLedger = (): EvidenceLedger => ({
  artifactPresent: false,
  validation: [],
  criteria: [],
  findings: [],
  discarded: [],
  diagnostics: [],
});

/**
 * A fresh state. Built by a function rather than exported as a constant: the
 * timeline holds one of these per entry, and a shared object would let one
 * entry's identity stand in for another's.
 */
export const emptyState = (): InspectorState => ({
  orchestration: null,
  run: null,
  contract: { goal: '', criteria: [], source: null, pipelineVersion: null },
  iteration: null,
  artifact: null,
  validation: [],
  lenses: { critics: {}, evaluators: {} },
  ledger: emptyLedger(),
  decision: null,
  remediations: [],
  standing: null,
  failure: null,
  exchanges: [],
});

/** The key a lens cell lives at: the lens and its sample, so samples never collide. */
export const lensCellKey = (lens: string, sample: number | null): string =>
  sample === null ? lens : `${lens}#s${sample}`;
