import type { CanvasGraph } from './canvas';
import type { ApiListResponse, ApiResponse } from './envelope';
import type { EvalStatus, EvaluationDto, Grade } from './evaluations';
import type { IsoDateString, Uuid } from './primitives';

export const SESSION_STATUSES = ['in-progress', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface DesignSessionDto {
  id: Uuid;
  promptId: Uuid;
  status: SessionStatus;
  revisionCount: number;
  latestRevisionNumber: number | null;
  latestGrade: Grade | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** Full revision — graph included. Immutable once submitted. */
export interface DesignRevisionDto {
  id: Uuid;
  sessionId: Uuid;
  revisionNumber: number;
  graph: CanvasGraph;
  /**
   * The design narrative: the author's prose explanation of what each
   * component is for and how they cooperate to meet the requirements.
   * Submitted alongside the graph and graded for alignment with it.
   */
  narrative: string | null;
  /** Embedded so one GET answers "what did I submit and how did it do". */
  evaluation: EvaluationDto | null;
  createdAt: IsoDateString;
}

/** List projection: everything but the graph, which can be large. */
export interface DesignRevisionSummaryDto {
  id: Uuid;
  revisionNumber: number;
  /** See `DesignRevisionDto.narrative`. */
  narrative: string | null;
  evaluationStatus: EvalStatus | null;
  overallScore: number | null;
  grade: Grade | null;
  createdAt: IsoDateString;
}

export interface CreateSessionRequest {
  promptId: Uuid;
}

export interface UpdateSessionRequest {
  status: SessionStatus;
}

export interface SubmitRevisionRequest {
  graph: CanvasGraph;
  /**
   * Optional design narrative — the author's explanation of what each
   * component is for and how they cooperate to meet the requirements.
   */
  narrative?: string;
}

export interface ListSessionsQuery {
  promptId?: Uuid;
  limit?: number;
  offset?: number;
}

export const NARRATIVE_MAX_LENGTH = 4000;

export type ListSessionsResponse = ApiListResponse<DesignSessionDto>;
export type GetSessionResponse = ApiResponse<DesignSessionDto>;
export type ListRevisionsResponse = ApiListResponse<DesignRevisionSummaryDto>;
export type GetRevisionResponse = ApiResponse<DesignRevisionDto>;
