/**
 * An orchestration run: a declared map of registered pipelines, run in order
 * by one generic runner and recorded step by step. The orchestrator is data
 * beside the pipelines; the record is one shape for every orchestrator; and
 * every child is an ordinary quality run answering at `GET /runs/:id`.
 */
import type { ApiListResponse, ApiResponse } from '../envelope';
import type { IsoDateString, Uuid } from '../primitives';
import type {
  QualityRunRequestSummary,
  QualityRunStatus,
  RunErrorDto,
  StartQualityRunRequest,
} from './runs';

export const ORCHESTRATION_STEP_STATUSES = [
  'pending',
  'running',
  'complete',
  'skipped',
  'failed',
] as const;
export type OrchestrationStepStatus = (typeof ORCHESTRATION_STEP_STATUSES)[number];

/**
 * The reasons the runner assigns on its own. An orchestrator declares every
 * other reason its steps may give — closed per orchestrator, so a client still
 * maps tones and never parses prose.
 */
export const ORCHESTRATION_REASONS = [
  'upstream-failed',
  'upstream-skipped',
  'run-failed',
  'pipeline-unavailable',
  'provided-run',
  'errored',
  'interrupted',
] as const;
export type OrchestrationReason = (typeof ORCHESTRATION_REASONS)[number];

export interface OrchestrationStepDto {
  status: OrchestrationStepStatus;
  reason: string | null;
  /** The child quality runs, each known as soon as it opens, in the order they opened. */
  runIds: string[];
  /** Detail behind the reason — a child's error message, the upstream step that blocked, an availability note. */
  note: string | null;
  counts: Record<string, number>;
  /** What the step reports beyond counts — the orchestrator's own shape, like its context. Null when it reports nothing. */
  report: Record<string, unknown> | null;
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
}

/** The run inputs as recorded, plus the one input only an orchestration takes. */
export interface OrchestrationRequestSummary extends QualityRunRequestSummary {
  /** How many times a panel step was asked to run each of its pipelines; null when the request named none. */
  samples: number | null;
}

export interface OrchestrationRunDto {
  orchestrationRunId: Uuid;
  orchestrator: string;
  /** The pipeline the request named as the target, when the orchestrator takes one. */
  pipeline: string | null;
  status: QualityRunStatus;
  startedAt: IsoDateString;
  finishedAt: IsoDateString | null;
  /** The bare goal as requested; a child's own record carries whatever the orchestrator appended. */
  request: OrchestrationRequestSummary;
  /** What the orchestrator observed at open — availability, mostly. Its own shape, declared by the orchestrator. */
  context: Record<string, unknown>;
  /** The step ledger: the declared step ids, in declared order. */
  steps: Record<string, OrchestrationStepDto>;
  error: RunErrorDto | null;
}

export interface OrchestrationRunStartedDto {
  orchestrationRunId: Uuid;
  status: QualityRunStatus;
}

/** A panel step runs each of its pipelines this many times unless the request says otherwise. */
export const DEFAULT_PANEL_SAMPLES = 3;
/** Every sample is a whole run on the subscription client; the request may not ask for more than this. */
export const MAX_PANEL_SAMPLES = 5;

/**
 * The run inputs, plus the two an orchestration decides for itself: whether a
 * target pipeline is named (declared per orchestrator — required by one that
 * takes a target, refused by one that chooses its own) and how many samples a
 * panel step runs. Which inputs reach which step is the orchestrator's business.
 */
export interface StartOrchestrationRequest extends Omit<StartQualityRunRequest, 'pipeline'> {
  pipeline?: string;
  samples?: number;
}

/** Start from a run that already happened, for the steps the orchestrator lets a provided run stand in for. */
export interface StartOrchestrationFromRunRequest {
  runId: string;
  samples?: number;
}

export interface ListOrchestrationRunsQuery {
  orchestrator?: string;
  pipeline?: string;
  status?: QualityRunStatus;
  limit?: number;
  offset?: number;
}

export type StartOrchestrationResponse = ApiResponse<OrchestrationRunStartedDto>;
export type GetOrchestrationRunResponse = ApiResponse<OrchestrationRunDto>;
export type ListOrchestrationRunsResponse = ApiListResponse<OrchestrationRunDto>;
