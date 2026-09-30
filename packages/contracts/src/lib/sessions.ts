import type {
  CanvasGraph,
  DesignBrief,
  DesignNarrative,
  DesignSubmission,
  SessionDraft,
} from './canvas.schema';
import type { ApiListResponse, ApiResponse } from './envelope';
import type { LlmModelDto } from './llm-model';
import type { IsoDateString, Uuid } from './primitives';
import { MAX_QUALITY_RUN_ITERATIONS, type QualityRunStatus } from './quality-loop/runs';
import type { Decision, IterationMode, StopReason } from './quality-loop/vocab';

export const SESSION_STATUSES = ['in-progress', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Who authored a revision: the practising user, or the coach — a quality-loop
 * revise iteration imported as its own revision. The timeline renders
 * assistant revisions with an explicit badge so a machine-made design is
 * never mistaken for the author's own.
 */
export const REVISION_ORIGINS = ['user', 'assistant'] as const;
export type RevisionOrigin = (typeof REVISION_ORIGINS)[number];

/**
 * Where a revision's grade lives: one iteration of one quality-loop run. The
 * scalars beside the pointer are a cache of the last terminal read, so lists
 * and timelines never fetch the loop.
 */
export interface RevisionEvaluationRef {
  runId: string;
  iteration: number;
  status: QualityRunStatus;
  overall: number | null;
  decision: Decision | null;
}

export interface DesignSessionDto {
  id: Uuid;
  promptId: Uuid;
  status: SessionStatus;
  revisionCount: number;
  latestRevisionNumber: number | null;
  latestOverall: number | null;
  latestDecision: Decision | null;
  latestEvaluationStatus: QualityRunStatus | null;
  /** The unsubmitted canvas saved with the session; null once submitted or never edited. */
  draft: SessionDraft | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Full revision — graph included. Immutable once submitted. */
export interface DesignRevisionDto {
  id: Uuid;
  sessionId: Uuid;
  revisionNumber: number;
  origin: RevisionOrigin;
  graph: CanvasGraph;
  brief: DesignBrief | null;
  narrative: DesignNarrative | null;
  /** Null only for revisions stored before grading was delegated. */
  evaluation: RevisionEvaluationRef | null;
  createdAt: IsoDateString;
}

/** List projection: the header and the grade, never the design itself. */
export interface DesignRevisionSummaryDto {
  id: Uuid;
  revisionNumber: number;
  origin: RevisionOrigin;
  evaluation: RevisionEvaluationRef | null;
  createdAt: IsoDateString;
}

export interface CreateSessionRequest {
  promptId: Uuid;
}

export interface UpdateSessionRequest {
  status: SessionStatus;
}

/** `POST /sessions/:id/revisions` — the design as drawn; graded by one quality-loop run. */
export type SubmitRevisionRequest = DesignSubmission;

export interface ListSessionsQuery {
  promptId?: Uuid;
  limit?: number;
  offset?: number;
}

/**
 * `POST /sessions/:id/improve` — hand the draft to the coach. The draft is
 * persisted first as the author's own revision, then the loop revises it up
 * to `maxIterations` times; every strictly better iteration becomes an
 * assistant revision.
 */
export interface StartImproveRequest extends DesignSubmission {
  maxIterations?: number;
}

export const DEFAULT_IMPROVE_ITERATIONS = 3;
export const MAX_IMPROVE_ITERATIONS = MAX_QUALITY_RUN_ITERATIONS;

/**
 * What became of one iteration in the studio: the base the run started from,
 * an assistant revision imported because it beat every earlier one, a lower
 * score left where it was, or an artifact the studio would not store.
 */
export const IMPROVE_ITERATION_OUTCOMES = ['base', 'imported', 'not-better', 'refused'] as const;
export type ImproveIterationOutcome = (typeof IMPROVE_ITERATION_OUTCOMES)[number];

export interface ImproveIterationDto {
  iteration: number;
  mode: IterationMode;
  overall: number | null;
  decision: Decision | null;
  /** The controller's own sentence for its decision. */
  reason: string | null;
  outcome: ImproveIterationOutcome;
  /** Why the studio refused to store the artifact; empty unless `outcome` is `refused`. */
  problems: string[];
  /** The revision this iteration is or became; null when `outcome` says why there is none. */
  revisionId: Uuid | null;
}

export interface ImproveRunDto {
  runId: string;
  sessionId: Uuid;
  /** The revision iteration 1 of the run is — the draft stored for it, or the graded revision it adopted. */
  baseRevisionId: Uuid;
  maxIterations: number;
  status: QualityRunStatus;
  llm: LlmModelDto;
  /** Model calls made so far — the only live signal while the loop runs. */
  exchangeCount: number;
  iterations: ImproveIterationDto[];
  stopReason: StopReason | null;
  error: string | null;
}

export interface StartImproveDto {
  runId: string;
  revision: DesignRevisionDto;
}

/** `PUT /sessions/:id/draft` — the unsubmitted canvas, shape-checked only; 204. */
export type PutSessionDraftRequest = SessionDraft;
/** `GET /sessions/:id/draft` — the saved draft, or null. */
export type GetSessionDraftResponse = ApiResponse<SessionDraft | null>;

export type ListSessionsResponse = ApiListResponse<DesignSessionDto>;
export type GetSessionResponse = ApiResponse<DesignSessionDto>;
export type ListRevisionsResponse = ApiListResponse<DesignRevisionSummaryDto>;
export type GetRevisionResponse = ApiResponse<DesignRevisionDto>;
export type StartImproveResponse = ApiResponse<StartImproveDto>;
export type GetImproveRunResponse = ApiResponse<ImproveRunDto>;
