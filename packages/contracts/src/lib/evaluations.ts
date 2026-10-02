import type { ApiResponse } from './envelope';
import type { LlmModelDto } from './llm-model';
import type { EvidenceResult } from './quality-loop/evidence';
import type { LocatedRef } from './submission-locations';
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
export type EvaluationLocationDto = LocatedRef;

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
  /**
   * Every place the lens pointed at that the stored revision could place —
   * the refs it cited, then the ids its rationale names — with its label and
   * the author's key.
   */
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
  /**
   * Whether this grade can still change: false while the run is still
   * running — even once this iteration is `complete`, since whether it ends
   * the run, and why (`stopReason`), is known only when the run stops — and
   * true once the run has completed or failed. A reader polls until it is.
   */
  settled: boolean;
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
  /**
   * Why the run stopped, when that is news to the reader of this grade
   * (`gradeStopReason`): a coach run that used its budget or stopped
   * improving, on the iteration that ended it. Null on every earlier
   * iteration, on a stop the decision already states, and on a plain grade —
   * one judgement always ends on its budget of one.
   */
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
