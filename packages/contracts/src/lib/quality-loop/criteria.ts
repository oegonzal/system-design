import type { ApiResponse } from '../envelope';
import type { LlmAvailabilityDto } from '../llm-availability';
import type { Diagnostic, SuccessCriterion } from './evidence';

/** `POST /criteria`: derive a pipeline's rubric from a goal, without running the pipeline. */
export interface DeriveCriteriaRequest {
  pipeline: string;
  goal: string;
}

/**
 * The derive-criteria stage alone — one model call, no run row, no dump.
 * `criteria` is empty, never invented, when `diagnostic` says why; without a
 * model the service answers 503 with `llm` rather than a rubric.
 */
export interface DerivedCriteriaDto {
  pipeline: string;
  criteria: SuccessCriterion[];
  diagnostic: Diagnostic | null;
  llm: LlmAvailabilityDto;
}

export type DeriveCriteriaResponse = ApiResponse<DerivedCriteriaDto>;
