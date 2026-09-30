import type { ApiResponse } from './envelope';
import type { LlmModelDto } from './llm-model';
import type { EvidenceResult } from './quality-loop/evidence';
import type { QualityRunStatus } from './quality-loop/runs';
import type {
  AxisFactorLevel,
  Decision,
  Fixability,
  Severity,
  StopReason,
} from './quality-loop/vocab';

/**
 * What the studio shows for a graded revision: the quality loop's run, read
 * for one iteration and grounded back onto the canvas. The studio holds no
 * rubric of its own — every number here is the loop's controller's, every
 * finding a lens's, and the only thing the studio adds is the mapping from
 * the loop's positional location ids back to the author's node and edge ids.
 */

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
  /** `node.N` / `edge.N` refs resolved to the canvas ids they name. */
  nodeIds: string[];
  edgeIds: string[];
  /** Every location the lens cited, verbatim — including refs into the brief and narrative. */
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
}

export interface EvaluationDto {
  runId: string;
  /** Which iteration of the run this revision is: 1 for a submission, k for a coach revision. */
  iteration: number;
  status: QualityRunStatus;
  llm: LlmModelDto;
  overall: number | null;
  decision: Decision | null;
  /** Keyed by the pipeline's own dimension names; null means the dimension was not assessed. */
  dimensions: Record<string, number | null>;
  findings: EvaluationFindingDto[];
  criterionResults: CriterionResultDto[];
  stopReason: StopReason | null;
  error: string | null;
}

export type GetEvaluationResponse = ApiResponse<EvaluationDto>;
