import type { ApiResponse } from '../envelope';
import type { LlmModelDto } from '../llm-model';
import type { Diagnostic, SuccessCriterion } from './evidence';

/** `POST /criteria`: derive a pipeline's rubric from a goal, without running the pipeline. */
export interface DeriveCriteriaRequest {
  pipeline: string;
  goal: string;
}

/**
 * The derive-criteria stage alone — one model call, no run row, no dump.
 * `criteria` is empty only with a `diagnostic` that says why, and then the
 * service answers 503 with it rather than a rubric a run could be started
 * against; `llm` names the model that was asked.
 */
export interface DerivedCriteriaDto {
  pipeline: string;
  criteria: SuccessCriterion[];
  diagnostic: Diagnostic | null;
  llm: LlmModelDto;
}

export type DeriveCriteriaResponse = ApiResponse<DerivedCriteriaDto>;
