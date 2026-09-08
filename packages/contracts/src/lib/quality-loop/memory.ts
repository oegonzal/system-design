/**
 * A memory run: the orchestration of recall → target → digest → store over
 * three ordinary quality runs. Everything a client needs to render it lives
 * here — the step ledger with closed reasons, the availability the run saw,
 * and the ids of the child runs, which answer at `GET /runs/:id` as today.
 */
import type { ApiListResponse, ApiResponse } from '../envelope';
import type { LlmAvailabilityDto } from '../llm-availability';
import type { IsoDateString, Uuid } from '../primitives';
import type {
  QualityRunRequestSummary,
  QualityRunStatus,
  RunErrorDto,
  StartQualityRunRequest,
} from './runs';

/** The four steps, in the order they run. */
export const MEMORY_STEPS = ['recall', 'target', 'digest', 'store'] as const;
export type MemoryStep = (typeof MEMORY_STEPS)[number];

export const MEMORY_STEP_STATUSES = [
  'pending',
  'running',
  'complete',
  'skipped',
  'failed',
] as const;
export type MemoryStepStatus = (typeof MEMORY_STEP_STATUSES)[number];

/** Why a step was skipped, failed, or completed without effect — closed, so a client maps tones, never prose. */
export const MEMORY_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'store-empty',
  'embedding-failed',
  'pipeline-unavailable',
  'run-failed',
  'not-accepted',
  'no-usable-memory',
  'goal-at-budget',
  'provided-run',
  'target-failed',
  'nothing-to-digest',
  'digest-failed',
  'no-memories',
  'interrupted',
  'errored',
] as const;
export type MemoryStepReason = (typeof MEMORY_STEP_REASONS)[number];

export interface MemoryStepDto {
  status: MemoryStepStatus;
  reason: MemoryStepReason | null;
  /** The child quality run, known as soon as it opens. */
  runId: string | null;
  /** Detail behind the reason — a child's error message, an availability note. */
  note: string | null;
  counts: Record<string, number>;
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
}

/** Whether the vector store can serve — derived facts, never credentials. */
export interface MemoryStoreAvailabilityDto {
  ready: boolean;
  reason: 'unreachable' | 'no-model' | null;
  /** The cause behind `unreachable`, for the boot log and the row — never a credential. */
  note: string | null;
  model: string | null;
  collection: string | null;
  chunks: number;
}

export interface MemoryRunDto {
  memoryRunId: Uuid;
  /** The target pipeline; recall and digest are the memory pipelines. */
  pipeline: string;
  status: QualityRunStatus;
  startedAt: IsoDateString;
  finishedAt: IsoDateString | null;
  /** The bare goal as requested — the target's own record carries the goal with memory appended. */
  request: QualityRunRequestSummary;
  embedding: LlmAvailabilityDto;
  store: MemoryStoreAvailabilityDto;
  steps: Record<MemoryStep, MemoryStepDto>;
  error: RunErrorDto | null;
}

export interface MemoryRunStartedDto {
  memoryRunId: Uuid;
  status: QualityRunStatus;
}

/** Exactly the run inputs: `output` and `maxIterations` reach the target only. */
export type StartMemoryRunRequest = StartQualityRunRequest;

/** Digest an already persisted run and store what it teaches. */
export interface DigestRunRequest {
  runId: string;
}

export type StartMemoryRunResponse = ApiResponse<MemoryRunStartedDto>;
export type GetMemoryRunResponse = ApiResponse<MemoryRunDto>;
export type ListMemoryRunsResponse = ApiListResponse<MemoryRunDto>;

/**
 * What a re-index did. It is a store step in every respect but persistence:
 * the run it re-indexed is already closed, so this is reported rather than
 * written back to that run's ledger.
 */
export type ReindexMemoryRunResponse = ApiResponse<MemoryStepDto>;

/** One chunk as a search returned it. */
export interface RetrievalHitDto {
  runId: string;
  ref: string;
  /** Cosine against the probe that found it; comparable only within one list. */
  score: number;
  text: string;
}

/** What one probe found, per named vector it was compared against. */
export interface RetrievalProbeDto {
  alias: string;
  text: string;
  found: { using: string; hits: RetrievalHitDto[] }[];
}

/**
 * What a recall would retrieve for a goal, without running any pipeline.
 * The tool for deciding whether the probes discriminate and whether a score
 * floor could ever be set: it reports every probe's own ranking beside the
 * fused one, so a floor is chosen against measurements rather than guessed.
 */
export interface RetrievalReportDto {
  store: MemoryStoreAvailabilityDto;
  probes: RetrievalProbeDto[];
  /** The fused list, in the order the curator would receive it. */
  candidates: (RetrievalHitDto & { alias: string; matched: string[] })[];
}

export type RetrievalReportResponse = ApiResponse<RetrievalReportDto>;
