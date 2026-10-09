import type { ApiResponse } from '../envelope';
import type { LlmModelDto } from '../llm-model';
import type { Diagnostic, SuccessCriterion } from './evidence';

/** `POST /criteria`: derive a pipeline's rubric from a goal, without running the pipeline. */
export interface DeriveCriteriaRequest {
  pipeline: string;
  goal: string;
}

/**
 * The derive-criteria stage alone — one model call and no run row. `criteria`
 * is empty only with a `diagnostic` that says why, and then the service
 * answers 503 with it rather than a rubric a run could be started against;
 * `llm` names the model that was asked. The call is dumped as a folder of its
 * own beside the runs' — the goal, the criteria and the exchange — and
 * `dumpRunId` names it; null when the disk refused the write.
 */
export interface DerivedCriteriaDto {
  pipeline: string;
  criteria: SuccessCriterion[];
  diagnostic: Diagnostic | null;
  llm: LlmModelDto;
  dumpRunId: string | null;
}

export type DeriveCriteriaResponse = ApiResponse<DerivedCriteriaDto>;
