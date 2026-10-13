/**
 * The memory orchestrator's own wire types: what it observes at open, the
 * reasons its steps may give, and the two tools beside it — the re-index and
 * the retrieval report. The run itself is an `OrchestrationRunDto`.
 */
import { z } from 'zod';

import type { ApiResponse } from '../envelope';
import { llmAvailabilitySchema } from '../llm-availability';
import type { OrchestrationStepDto } from './orchestration';

export const MEMORY_ORCHESTRATOR_ID = 'memory';

/**
 * Why a memory step skipped, failed, or completed without effect — beyond
 * the runner's own reasons. A child run that was judged and fell short is
 * `not-accepted`; one that was never judged says why instead — `no-rubric`
 * when it derived no criteria, `no-artifact` when it produced nothing — so a
 * miss is never read as a verdict on what it would have judged. A search
 * whose hits could not be composed into the curator's query is
 * `query-refused`, with the faults in the note. A source run whose only
 * judged evidence is an iteration it adopted is `nothing-new`, with the run
 * it adopted from in the note: its ledger is a copy that run's own digest
 * already read.
 */
export const MEMORY_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'store-empty',
  'embedding-failed',
  'query-refused',
  'not-accepted',
  'no-rubric',
  'no-artifact',
  'no-usable-memory',
  'goal-at-budget',
  'nothing-to-digest',
  'nothing-new',
  'no-memories',
] as const;
export type MemoryStepReason = (typeof MEMORY_STEP_REASONS)[number];

/** Whether the vector store can serve — derived facts, never credentials. */
export const memoryStoreAvailabilitySchema = z.strictObject({
  ready: z.boolean(),
  reason: z.enum(['unreachable', 'no-model']).nullable(),
  /** The cause behind `unreachable`, for the boot log and the row — never a credential. */
  note: z.string().nullable(),
  model: z.string().nullable(),
  collection: z.string().nullable(),
  chunks: z.number().int().nonnegative(),
});
export type MemoryStoreAvailabilityDto = z.infer<typeof memoryStoreAvailabilitySchema>;

/**
 * What every memory-backed orchestrator records at open, under
 * `OrchestrationRunDto.context`, and the shape it declares for it: the one
 * declaration the four of them share.
 */
export const memoryContextSchema = z.strictObject({
  embedding: llmAvailabilitySchema,
  store: memoryStoreAvailabilitySchema,
});
export type MemoryContextDto = z.infer<typeof memoryContextSchema>;

/**
 * What a re-index did. It is a store step in every respect but persistence:
 * the run it re-indexed is already closed, so this is reported rather than
 * written back to that run's ledger.
 */
export type ReindexMemoryRunResponse = ApiResponse<OrchestrationStepDto>;

/**
 * What a retraction did: every point a digest run stored, gone from the
 * store. A digest run has one writer, so the run id is the unit a caller
 * retracts by — a document taught again, a document ingested again by force —
 * and retracting a run the store never held removes nothing and is no error.
 */
export interface RetractedMemoryRunDto {
  runId: string;
  removed: number;
}
export type RetractMemoryRunResponse = ApiResponse<RetractedMemoryRunDto>;

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
