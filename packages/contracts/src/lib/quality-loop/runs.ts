import type { ApiListResponse, ApiResponse } from '../envelope';
import type { LlmModelDto } from '../llm-model';
import type { IsoDateString } from '../primitives';
import type { RunTrace } from './decision';
import type { SuccessCriterion } from './evidence';
import type { RunRecallDto, RunRecallSummaryDto } from './recall';
import { STOP_REASON_CAUSES, type Decision, type StopReason } from './vocab';

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
  /**
   * Which try this was within one call, 1-based. Absent on rows written before
   * the seam could retry, which read as a single attempt.
   */
  attempt?: number;
  /**
   * Why there is no response, by name only — the provider's reason or the
   * schema's. The message stays in the dump; the name is here so "which
   * failures cost us samples" is a group-by over the rows rather than a walk
   * over dump folders.
   */
  errorName?: string | null;
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
 * Whether a run as requested could ever call its producer. Iteration 1
 * produces unless it judges a supplied artifact or adopts a recorded
 * iteration, and every later iteration may revise — so a run that starts
 * from an artifact with a budget of one iteration never produces. Read from
 * the request alone, before the run does anything; the loop's spec pins that
 * it agrees.
 */
export const mayProduce = ({
  outputProvided,
  adoptedFrom,
  maxIterations,
}: Pick<QualityRunRequestSummary, 'outputProvided' | 'adoptedFrom' | 'maxIterations'>): boolean =>
  (!outputProvided && adoptedFrom === null) || maxIterations > 1;

/**
 * The stop reason worth telling the reader of a grade, or null when the stop
 * is only the ordinary end of what the run was asked for. A stop the last
 * decision caused is said by the decision beside it. A stop on the budget is
 * news only on a run that could revise (`mayProduce`) — a coach that used its
 * iterations, or stopped improving. A run asked to judge once always ends on
 * its budget of one: that is a grade finishing, not a limit its author met.
 * The run's own record keeps its reason either way.
 */
export const gradeStopReason = (
  stopReason: StopReason | null,
  request: Pick<QualityRunRequestSummary, 'outputProvided' | 'adoptedFrom' | 'maxIterations'>,
): StopReason | null =>
  stopReason !== null && STOP_REASON_CAUSES[stopReason] === 'budget' && mayProduce(request)
    ? stopReason
    : null;

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
  /**
   * The run this one was opened for, when a run composed it: the memory-recall
   * run a run's recall opens names that run, as the run names it back in
   * `recall.recallRunId`. Null for a run started on its own — and for an
   * orchestration's children, which the orchestration's own record lists.
   * Never asked for: it follows from what a run declared (its producer
   * consumes memories, and it asked to recall).
   */
  parentRunId: string | null;
  /**
   * The lessons recalled for the goal before the run produced — `recalling`
   * from the moment the run opens until they are in — and the producer saw
   * exactly `recall.lessons`. Null when the run did not ask to recall.
   */
  recall: RunRecallDto | null;
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
  /**
   * Recall lessons from earlier runs for the goal before producing, and hand
   * them to the producer alone: the deriver, the critics and the evaluators
   * never see them. Curated by a recorded memory-recall run; a recall that
   * cannot run or finds nothing never fails this one, and `recall` on the run
   * says what happened. Refused (400) for a pipeline whose producer does not
   * consume memories.
   */
  recall?: boolean;
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
  /** The run this one was opened for, as on `QualityRunDto.parentRunId`: a list of recall runs names the run each served. */
  parentRunId: string | null;
  /** The run's recall without its lessons; null when it did not ask to recall. */
  recall: RunRecallSummaryDto | null;
}

/** `GET /runs` — newest first; `limit` defaults to DEFAULT_LIST_LIMIT, capped at MAX_LIST_LIMIT. */
export interface ListQualityRunsQuery {
  pipeline?: string;
  status?: QualityRunStatus;
  limit?: number;
  offset?: number;
}

export type ListQualityRunsResponse = ApiListResponse<QualityRunSummaryDto>;
