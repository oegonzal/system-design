import type { ApiResponse } from './envelope';
import type { LlmModelDto } from './llm-model';
import type { EvidenceResult } from './quality-loop/evidence';
import type { SubmissionPart } from './submission-locations';
import type { QualityRunStatus } from './quality-loop/runs';
import type {
  AxisFactorLevel,
  Decision,
  DiagnosticReason,
  Fixability,
  Severity,
  StopReason,
} from './quality-loop/vocab';

/**
 * What the studio shows for a graded revision: the quality loop's run, read
 * for one iteration and grounded back onto the canvas. The studio holds no
 * rubric of its own — every number here is the loop's controller's, every
 * finding a lens's, and the only thing the studio adds is the join from the
 * loop's positional location ids back onto the stored revision, through the
 * one numbering both sides share (`submissionLocations`).
 */

/** One place a finding cites, joined back onto the graded submission. */
export interface EvaluationLocationDto {
  /** The positional id the lens cited, verbatim: `node.3`, `binding.1`, `overview`, … */
  ref: string;
  label: string;
  part: SubmissionPart;
  /** The author's own id for the part — a node id, an edge id, a criterion id; null for the overview. */
  key: string | null;
}

export interface EvaluationFindingDto {
  /** The loop's structural key for the defect — stable across polls. */
  id: string;
  /** Every lens that confirmed it. */
  lenses: string[];
  type: string;
  severity: Severity;
  confidence: AxisFactorLevel;
  fixability: Fixability;
  criterionIds: string[];
  /** Every cited ref the stored revision could place, with its label and the author's key. */
  locations: EvaluationLocationDto[];
  /** The `locations` of part `node` / `edge`, by the author's ids — what the canvas highlights. */
  nodeIds: string[];
  edgeIds: string[];
  /** Every location the lens cited, verbatim — including refs the revision could not place. */
  locationRefs: string[];
  rationale: string | null;
  /** A criterion already charging this lesson; a reconciled finding was not priced twice. */
  reconciledTo: string | null;
}

export interface CriterionResultDto {
  criterionId: string;
  result: EvidenceResult;
  confidence: AxisFactorLevel | null;
  rationale: string | null;
  /**
   * Every place the rationale's lens cited — by ref, or by naming a positional
   * id in its prose — that the stored revision could place, so a reader sees
   * the label where the model wrote `edge.5`.
   */
  locations: EvaluationLocationDto[];
}

/** A lens sample that should have answered and did not: the grade stands on the samples that did. */
export interface DegradedSampleDto {
  /** The lens that ran it — `critic.scale`, `evaluator.quality`. */
  stage: string;
  sample: number | null;
  reason: DiagnosticReason;
}

export interface EvaluationDto {
  runId: string;
  /** Which iteration of the run this revision is: 1 for a submission, k for a coach revision. */
  iteration: number;
  /**
   * This iteration's grade: complete once the run has recorded it — a coach's
   * earlier iterations finish while it is still revising — otherwise the
   * run's own state, and failed when the run ended without it.
   */
  status: QualityRunStatus;
  llm: LlmModelDto;
  /** The controller's score; null when the run has no iteration yet, when the iteration had no artifact, and when it assessed nothing — never the controller's zero for an empty ledger. */
  overall: number | null;
  decision: Decision | null;
  /** The controller's own sentence for its decision. */
  decisionReason: string | null;
  /** Keyed by the pipeline's own dimension names; null means the dimension was not assessed. */
  dimensions: Record<string, number | null>;
  findings: EvaluationFindingDto[];
  criterionResults: CriterionResultDto[];
  /** Why the run stopped — only on the iteration that ended a completed run; null on every earlier one. */
  stopReason: StopReason | null;
  /**
   * The lens samples of this iteration that should have answered and did not
   * (`DIAGNOSTIC_DEGRADES`); empty when every lens with something to judge
   * answered. A lens skipped as not applicable is not one.
   */
  degraded: DegradedSampleDto[];
  error: string | null;
}

export type GetEvaluationResponse = ApiResponse<EvaluationDto>;
