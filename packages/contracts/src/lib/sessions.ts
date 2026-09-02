import type { CanvasGraph } from './canvas';
import type { DesignBrief } from './design-brief';
import type { DesignNarrative } from './narration';
import type { ApiListResponse, ApiResponse } from './envelope';
import type { EvalStatus, EvaluationDto, Grade } from './evaluations';
import type { IsoDateString, Uuid } from './primitives';

export const SESSION_STATUSES = ['in-progress', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Who authored a revision: the practising user, or the AI coach's improvement
 * run. The timeline renders assistant revisions with an explicit badge so a
 * machine-made grade is never mistaken for the author's own.
 */
export const REVISION_ORIGINS = ['user', 'assistant'] as const;
export type RevisionOrigin = (typeof REVISION_ORIGINS)[number];

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
  origin: RevisionOrigin;
  graph: CanvasGraph;
  /**
   * The walkthrough: reference-anchored prose explaining why each component is
   * there and how each requirement's flow travels. Graded — a substantive,
   * aligned narrative is required for a top grade; see {@link DesignNarrative}.
   */
  narrative: DesignNarrative | null;
  /** The graded explanation: requirement bindings and traced flows. */
  brief: DesignBrief | null;
  /** Embedded so one GET answers "what did I submit and how did it do". */
  evaluation: EvaluationDto | null;
  createdAt: IsoDateString;
}

/** List projection: everything but the graph, which can be large. */
export interface DesignRevisionSummaryDto {
  id: Uuid;
  revisionNumber: number;
  origin: RevisionOrigin;
  /** See `DesignRevisionDto.narrative`. */
  narrative: DesignNarrative | null;
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
   * The graded explanation: which components hold each requirement, and how a
   * request travels. Optional — a diagram may be submitted without one, and
   * that absence is itself graded.
   */
  brief?: DesignBrief;
  /**
   * The design narrative — reference-anchored prose explaining what each
   * component is for and how the requirements' flows travel. Optional to
   * submit, but its absence is graded and caps the grade below a top mark.
   */
  narrative?: DesignNarrative;
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
