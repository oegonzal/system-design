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
  /** The child quality run, known as soon as it opens. */
  runId: string | null;
  /** Detail behind the reason — a child's error message, the upstream step that blocked, an availability note. */
  note: string | null;
  counts: Record<string, number>;
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
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
  request: QualityRunRequestSummary;
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

/** Exactly the run inputs; which of them reach which step is the orchestrator's business. */
export type StartOrchestrationRequest = StartQualityRunRequest;

/** Start from a run that already happened, for the steps the orchestrator lets a provided run stand in for. */
export interface StartOrchestrationFromRunRequest {
  runId: string;
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
