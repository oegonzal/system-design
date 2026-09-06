import type { ApiResponse } from '../envelope';
import type { LlmAvailabilityDto } from '../llm-availability';
import type { IsoDateString } from '../primitives';
import type { RunTrace } from './decision';

export const QUALITY_RUN_STATUSES = ['running', 'complete', 'failed'] as const;
export type QualityRunStatus = (typeof QUALITY_RUN_STATUSES)[number];

/** `refusal` and `schema-miss` both came back from a well-formed response; `error` never reached one. */
export const LLM_EXCHANGE_OUTCOMES = ['ok', 'refusal', 'schema-miss', 'error'] as const;
export type LlmExchangeOutcome = (typeof LLM_EXCHANGE_OUTCOMES)[number];

/** One model call, attributed to its stage and sample. Prompts and responses stay in the dump. */
export interface LlmExchangeSummaryDto {
  scope: string;
  ordinal: number;
  outcome: LlmExchangeOutcome;
  durationMs: number;
  startedAt: IsoDateString;
}

export interface RunErrorDto {
  name: string;
  message: string;
  stack: string | null;
}

export interface QualityRunRequestSummary {
  goal: string;
  outputProvided: boolean;
  maxIterations: number;
}

/** One run as the service reports it. `trace` is null until the loop ends; `exchanges` grow live. */
export interface QualityRunDto {
  runId: string;
  pipeline: string;
  status: QualityRunStatus;
  startedAt: IsoDateString;
  finishedAt: IsoDateString | null;
  llm: LlmAvailabilityDto;
  request: QualityRunRequestSummary;
  trace: RunTrace | null;
  exchanges: LlmExchangeSummaryDto[];
  error: RunErrorDto | null;
}

export interface QualityRunStartedDto {
  runId: string;
  status: QualityRunStatus;
}

/** The body of `POST /runs`. `output` is any JSON; the pipeline's schema validator judges it. */
export interface StartQualityRunRequest {
  pipeline: string;
  goal: string;
  output?: unknown;
  maxIterations?: number;
}

export const DEFAULT_QUALITY_RUN_ITERATIONS = 1;
/** A request may shorten a pipeline's loop, never lengthen it past this. */
export const MAX_QUALITY_RUN_ITERATIONS = 10;

export type StartQualityRunResponse = ApiResponse<QualityRunStartedDto>;
export type GetQualityRunResponse = ApiResponse<QualityRunDto>;
