/**
 * The memory orchestrator's own wire types: what it observes at open, the
 * reasons its steps may give, and the two tools beside it — the re-index and
 * the retrieval report. The run itself is an `OrchestrationRunDto`.
 */
import type { ApiResponse } from '../envelope';
import type { LlmAvailabilityDto } from '../llm-availability';
import type { OrchestrationStepDto } from './orchestration';

export const MEMORY_ORCHESTRATOR_ID = 'memory';

/** Why a memory step skipped, failed, or completed without effect — beyond the runner's own reasons. */
export const MEMORY_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'store-empty',
  'embedding-failed',
  'not-accepted',
  'no-usable-memory',
  'goal-at-budget',
  'nothing-to-digest',
  'no-memories',
] as const;
export type MemoryStepReason = (typeof MEMORY_STEP_REASONS)[number];

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

/** What the memory orchestrator records at open, under `OrchestrationRunDto.context`. */
export interface MemoryContextDto {
  embedding: LlmAvailabilityDto;
  store: MemoryStoreAvailabilityDto;
}

/**
 * What a re-index did. It is a store step in every respect but persistence:
 * the run it re-indexed is already closed, so this is reported rather than
 * written back to that run's ledger.
 */
export type ReindexMemoryRunResponse = ApiResponse<OrchestrationStepDto>;

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
