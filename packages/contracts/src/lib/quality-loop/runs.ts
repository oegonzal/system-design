import type { ApiListResponse, ApiResponse } from '../envelope';
import type { LlmModelDto } from '../llm-model';
import type { IsoDateString } from '../primitives';
import type { RunTrace } from './decision';
import type { SuccessCriterion } from './evidence';
import type { Decision, StopReason } from './vocab';

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

/** A recorded iteration of an earlier run, named by the run's id and the iteration's number. */
export interface AdoptedIterationRef {
  runId: string;
  iteration: number;
}

export interface QualityRunRequestSummary {
  goal: string;
  outputProvided: boolean;
  /** True when the caller supplied the rubric; false when it was derived from the goal. */
  criteriaProvided: boolean;
  /** The recorded iteration this run took as its iteration 1; null when it produced or judged its own. */
  adoptedFrom: AdoptedIterationRef | null;
  maxIterations: number;
}

/**
 * One run as the service reports it; `exchanges` grow live. While `status` is
 * `running`, `trace` holds the iterations finished so far with `stopReason`
 * null — null itself until the first iteration lands — and it is settled,
 * with its stop reason, once the run completes. An iteration once recorded is
 * final: a run that fails keeps every iteration it finished, with its
 * standing after the last and `stopReason` still null, since the loop never
 * chose to stop — `trace` is null only when it failed before the first.
 */
export interface QualityRunDto {
  runId: string;
  pipeline: string;
  status: QualityRunStatus;
  startedAt: IsoDateString;
  finishedAt: IsoDateString | null;
  llm: LlmModelDto;
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
  /**
   * A fixed rubric. When present the pipeline's derive-criteria stage is
   * skipped and these ids are the ones every lens cites — how a caller that
   * stores a rubric once keeps `c3` meaning `c3` across runs.
   */
  criteria?: SuccessCriterion[];
  /**
   * Adopt a recorded iteration of an earlier run as iteration 1 — verbatim,
   * in mode `adopted`, no model asked to judge it again — and go on from its
   * decision. Mutually exclusive with `output`. Requires `criteria` equal to
   * the adopted run's rubric, and the same pipeline id and version; anything
   * else is refused with 400.
   */
  adopt?: AdoptedIterationRef;
}

/** HTTP-edge cap on a supplied rubric; the pipeline's own `maxCriteria` is the real limit. */
export const MAX_PROVIDED_CRITERIA = 64;

export const DEFAULT_QUALITY_RUN_ITERATIONS = 1;
/** A request may shorten a pipeline's loop, never lengthen it past this. */
export const MAX_QUALITY_RUN_ITERATIONS = 10;

export type StartQualityRunResponse = ApiResponse<QualityRunStartedDto>;
export type GetQualityRunResponse = ApiResponse<QualityRunDto>;

/** One row of `GET /runs`: the header the list needs, never the trace. */
export interface QualityRunSummaryDto {
  runId: string;
  pipeline: string;
  pipelineVersion: string | null;
  status: QualityRunStatus;
  startedAt: IsoDateString;
  finishedAt: IsoDateString | null;
  finalDecision: Decision | null;
  stopReason: StopReason | null;
  /** The best iteration's overall score; null until the loop ends. */
  overall: number | null;
  iterations: number;
  criteria: number;
  exchangeCount: number;
  llm: LlmModelDto;
}

/** `GET /runs` — newest first; `limit` defaults to DEFAULT_LIST_LIMIT, capped at MAX_LIST_LIMIT. */
export interface ListQualityRunsQuery {
  pipeline?: string;
  status?: QualityRunStatus;
  limit?: number;
  offset?: number;
}

export type ListQualityRunsResponse = ApiListResponse<QualityRunSummaryDto>;
