import type {
  CanvasGraph,
  DesignBrief,
  DesignNarrative,
  DesignSubmission,
  SessionDraft,
} from './canvas.schema';
import type { ApiListResponse, ApiResponse } from './envelope';
import type { EvaluationFindingDto } from './evaluations';
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
  /** The practised prompt's title, so a list row says what was practised. */
  promptTitle: string;
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

/**
 * What can hold a session's one grading slot: a submitted revision's grade,
 * or a coaching run — which grades as it revises, from a draft or from an
 * adopted grade alike.
 */
export const IN_FLIGHT_KINDS = ['grade', 'coach'] as const;
export type InFlightKind = (typeof IN_FLIGHT_KINDS)[number];

/**
 * How a read knows the run holds the slot: `running` — the grader said so;
 * `unknown` — the studio's record says the run was running, and the grader
 * could not be asked. A write never acts on `unknown`: it asks the grader
 * under the session lock, and a grader that cannot answer refuses it.
 */
export const IN_FLIGHT_STATES = ['running', 'unknown'] as const;
export type InFlightState = (typeof IN_FLIGHT_STATES)[number];

/**
 * The run holding a session's grading slot. While one is, the session takes
 * no submit and no coach start: the API refuses both (409) with
 * `describeInFlight`, and a client disables both with the same sentence.
 */
export interface SessionInFlightDto {
  kind: InFlightKind;
  runId: string;
  /** The revision being graded, or the one the coach started from. */
  revisionNumber: number;
  state: InFlightState;
}

const IN_FLIGHT_COPY: Record<
  InFlightState,
  Record<InFlightKind, (revisionNumber: number) => string>
> = {
  running: {
    grade: (revisionNumber) =>
      `Revision #${revisionNumber} is still being graded — wait for its verdict.`,
    coach: (revisionNumber) =>
      `The coach is still revising from revision #${revisionNumber} — wait for it to finish.`,
  },
  unknown: {
    grade: (revisionNumber) =>
      `Revision #${revisionNumber} may still be being graded — the grader cannot be reached to say.`,
    coach: (revisionNumber) =>
      `The coach may still be revising from revision #${revisionNumber} — the grader cannot be reached to say.`,
  },
};

/** Why the session takes no submit and no coach start right now — the API's refusal and a client's disabled reason. */
export const describeInFlight = (inFlight: SessionInFlightDto): string =>
  IN_FLIGHT_COPY[inFlight.state][inFlight.kind](inFlight.revisionNumber);

/**
 * One session as `GET`, `POST` and `PATCH /sessions[/:id]` answer it: the
 * list row plus the run holding its grading slot. The grader is asked only
 * about a run the studio's record still says is running, and a grader that
 * cannot answer makes that run `unknown`, never the read a failure. Lists
 * leave it out — it can cost a grader read per session.
 */
export interface DesignSessionDetailDto extends DesignSessionDto {
  inFlight: SessionInFlightDto | null;
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
 * `POST /sessions/:id/improve` — hand the coach a starting point. From the
 * draft: it is persisted first as the author's own revision and graded as
 * iteration 1. From a graded revision: the loop adopts that grade verbatim as
 * iteration 1 and no revision is duplicated. Either way the loop then revises
 * up to `maxIterations` times, and every strictly better iteration becomes an
 * assistant revision.
 */
export interface StartImproveFromDraftRequest extends DesignSubmission {
  maxIterations?: number;
}
export interface StartImproveFromRevisionRequest {
  /** A revision of this session whose grade is complete. */
  baseRevisionId: Uuid;
  maxIterations?: number;
}
export type StartImproveRequest = StartImproveFromDraftRequest | StartImproveFromRevisionRequest;

/** One coaching run of a session, as `GET /sessions/:id/improve` lists them, newest first. */
export interface CoachingRunSummaryDto {
  runId: string;
  /** The revision iteration 1 of the run is. */
  baseRevisionId: Uuid;
  maxIterations: number;
  startedAt: string;
}

export const DEFAULT_IMPROVE_ITERATIONS = 3;
export const MAX_IMPROVE_ITERATIONS = MAX_QUALITY_RUN_ITERATIONS;

/**
 * What became of one iteration in the studio: the base the run started from,
 * an assistant revision imported because it beat every earlier one, a lower
 * score left where it was, an artifact the studio would not store, or no
 * artifact at all — the coach produced nothing to judge, so nothing was
 * scored and the design is not to blame.
 */
export const IMPROVE_ITERATION_OUTCOMES = [
  'base',
  'imported',
  'not-better',
  'refused',
  'no-artifact',
] as const;
export type ImproveIterationOutcome = (typeof IMPROVE_ITERATION_OUTCOMES)[number];

export interface ImproveIterationDto {
  iteration: number;
  mode: IterationMode;
  /** The controller's score; null when the iteration had no artifact or assessed nothing. */
  overall: number | null;
  decision: Decision | null;
  /** The controller's own sentence for its decision. */
  reason: string | null;
  /**
   * The iteration's confirmed findings, grounded on its own submission — the
   * artifact it judged — so a reader can name each finding `reason` cites by
   * its labels rather than its key. Empty when it confirmed none.
   */
  findings: EvaluationFindingDto[];
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
  /** Model calls made so far — a live signal between iterations. */
  exchangeCount: number;
  /** Every iteration the run has recorded — while it runs, the ones finished so far. */
  iterations: ImproveIterationDto[];
  /** Why the run stopped; null until it has completed. */
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
export type GetSessionResponse = ApiResponse<DesignSessionDetailDto>;
export type ListRevisionsResponse = ApiListResponse<DesignRevisionSummaryDto>;
export type GetRevisionResponse = ApiResponse<DesignRevisionDto>;
export type StartImproveResponse = ApiResponse<StartImproveDto>;
export type GetImproveRunResponse = ApiResponse<ImproveRunDto>;
export type ListCoachingRunsResponse = ApiResponse<CoachingRunSummaryDto[]>;
