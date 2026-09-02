import type { ApiResponse } from './envelope';
import type { IsoDateString, Uuid } from './primitives';
import type { SubmitRevisionRequest } from './sessions';

/**
 * The AI coach: a background improvement run over one session's design.
 *
 * A run starts from a base revision (the author's design at the moment they
 * asked for help), proposes candidate designs, and scores every candidate with
 * the same deterministic engine that grades submissions. A candidate is
 * accepted only when its overall score is STRICTLY higher than the best so
 * far, and every accepted candidate is persisted as a real revision with
 * origin 'assistant' — so the trajectory of accepted iterations is
 * monotonically increasing by construction, and rejected candidates are never
 * revisions.
 */
export const IMPROVEMENT_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type ImprovementRunStatus = (typeof IMPROVEMENT_RUN_STATUSES)[number];

/** Why a run stopped proposing. Set on completed runs; null while active. */
export const IMPROVEMENT_STOP_REASONS = [
  /** The best design reached a perfect score. */
  'perfect',
  /** Consecutive proposals failed to improve the score. */
  'plateau',
  /** The iteration budget ran out. */
  'max-iterations',
  /** The author cancelled; accepted work up to that point is kept. */
  'cancelled',
  /** The base design already had nothing above info-level to fix. */
  'already-clean',
  /** The worker found no usable LLM at claim time (env drifted after start). */
  'llm-unavailable',
] as const;
export type ImprovementStopReason = (typeof IMPROVEMENT_STOP_REASONS)[number];

/** Who produced a trajectory entry: entry 0 is the scored base design. */
export type ImprovementProposer = 'baseline' | 'llm';

export interface ImprovementIteration {
  /** 0 = the baseline score of the base revision; proposals count from 1. */
  iteration: number;
  proposer: ImprovementProposer;
  /** One sentence, from the proposer: what this candidate changed and why. */
  description: string;
  /** The deterministic engine's overallScore for this candidate. */
  score: number;
  accepted: boolean;
  /** The persisted revision — set only when accepted. */
  revisionId: Uuid | null;
  rejectedReason?: 'not-better' | 'invalid' | 'no-proposal';
}

export interface ImprovementRunDto {
  id: Uuid;
  sessionId: Uuid;
  baseRevisionId: Uuid;
  /** The highest-scoring accepted revision; null until something is accepted. */
  bestRevisionId: Uuid | null;
  status: ImprovementRunStatus;
  maxIterations: number;
  /** The live trajectory — the UI polls this to narrate progress. */
  iterations: ImprovementIteration[];
  stoppedReason: ImprovementStopReason | null;
  error: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/**
 * The current canvas state rides in the request, exactly like a submit — the
 * API persists it as the run's base revision (origin 'user') first, so what
 * the coach improved is always on the record.
 */
export interface StartImprovementRunRequest extends SubmitRevisionRequest {
  maxIterations?: number;
}

export const DEFAULT_IMPROVE_ITERATIONS = 6;
export const MAX_IMPROVE_ITERATIONS = 10;

/**
 * Whether the coach can run at all — it requires a live LLM (an
 * ANTHROPIC_API_KEY, and not being forced deterministic). The UI reads this to
 * disable the Improve button with an honest reason instead of a failing call.
 */
export interface ImproverAvailabilityDto {
  enabled: boolean;
  model: string | null;
  reason: 'deterministic' | 'no-key' | null;
}

export type StartImprovementRunResponse = ApiResponse<ImprovementRunDto>;
export type GetImprovementRunResponse = ApiResponse<ImprovementRunDto>;
export type GetImproverAvailabilityResponse = ApiResponse<ImproverAvailabilityDto>;
