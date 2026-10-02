import type { ApiResponse } from './envelope';
import type { LlmModelDto } from './llm-model';
import type { IsoDateString } from './primitives';
import type { DecisionFacts } from './quality-loop/decision';
import type { EvidenceResult } from './quality-loop/evidence';
import type { RunHeartbeatDto } from './quality-loop/health';
import type { LocatedRef } from './submission-locations';
import type { QualityRunStatus } from './quality-loop/runs';
import type {
  AxisFactorLevel,
  Decision,
  DiagnosticReason,
  Fixability,
  Severity,
  StopReason,
} from './quality-loop/vocab';

/**
 * What the studio shows for a graded revision: the quality loop's run, read
 * for one iteration and grounded back onto the canvas. The studio holds no
 * rubric of its own — every number here is the loop's controller's, every
 * finding a lens's, and the only thing the studio adds is the join from the
 * loop's positional location ids back onto the stored revision, through the
 * one numbering both sides share (`submissionLocations`).
 */

/** One place a finding cites, joined back onto the graded submission. */
export type EvaluationLocationDto = LocatedRef;

export interface EvaluationFindingDto {
  /** The loop's structural key for the defect — stable across polls. */
  id: string;
  /** Every lens that confirmed it. */
  lenses: string[];
  type: string;
  severity: Severity;
  confidence: AxisFactorLevel;
  fixability: Fixability;
  criterionIds: string[];
  /**
   * Every place the lens CITED that the stored revision could place — the
   * finding's ground, each with its label and the author's key. What the
   * chips show, what the canvas highlights, where an export says it is.
   */
  locations: EvaluationLocationDto[];
  /**
   * Places the rationale names besides the ones it cited, placed the same
   * way — so its prose reads in labels (`proseLocations`), and for nothing
   * else: a sentence that says "stops at edge.4" of an edge it never cited
   * does not make edge.4 the finding's.
   */
  mentions: EvaluationLocationDto[];
  /** The `locations` of part `node` / `edge`, by the author's ids — what the canvas highlights. */
  nodeIds: string[];
  edgeIds: string[];
  /** Every location the lens cited, verbatim — including refs the revision could not place. */
  locationRefs: string[];
  rationale: string | null;
  /** A criterion already charging this lesson; a reconciled finding was not priced twice. */
  reconciledTo: string | null;
}

export interface CriterionResultDto {
  criterionId: string;
  result: EvidenceResult;
  confidence: AxisFactorLevel | null;
  rationale: string | null;
  /** Every place the rationale's sample cited as its evidence that the stored revision could place. */
  locations: EvaluationLocationDto[];
  /** Places the rationale names besides the cited ones — for reading its prose in labels, nothing else. */
  mentions: EvaluationLocationDto[];
}

/**
 * Every place a lens's prose may name, for substituting labels into it: the
 * ones it cited and the ones it merely mentioned, each once. A glossary for
 * the words, never a list of where the finding is.
 */
export const proseLocations = ({
  locations,
  mentions,
}: Pick<
  EvaluationFindingDto | CriterionResultDto,
  'locations' | 'mentions'
>): EvaluationLocationDto[] => [...locations, ...mentions];

/**
 * Why a complete grade carries no score. `no-artifact`: the iteration
 * produced nothing to judge. `unassessed`: the loop's evidence gate found too
 * few of the criteria assessed for a verdict — the lenses that should have
 * judged them did not answer — so the controller's number is no score of the
 * design, and the grade is no verdict on it. Kept apart from a real 0, which
 * is a verdict.
 */
export const UNSCORED_REASONS = ['no-artifact', 'unassessed'] as const;
export type UnscoredReason = (typeof UNSCORED_REASONS)[number];

/**
 * What settled a decision, as data a reader words — the controller's own
 * sentence (`decisionReason`) is written for its trace, not for an author.
 */
export interface DecisionBasisDto {
  /**
   * The controller step that decided (`DecisionStep.factor`): a gate's name —
   * `evidence`, `policy-allowed`, `accept-threshold` — or the route's,
   * `route`. Open, as controllers are composed per pipeline; null for a trace
   * that recorded no deciding step.
   */
  factor: string | null;
  /**
   * What the deciding step decided on (`DecisionStep.facts`) — the score and
   * the threshold or floor it was held to, the blockers it named — keyed as
   * that step records them; empty when it recorded none.
   */
  facts: DecisionFacts;
  /** How many remediations the controller selected for the producer to apply. */
  remediations: number;
  /** How many of the iteration's criteria a lens assessed, of how many. */
  criteria: { assessed: number; total: number };
}

/** A lens sample that should have answered and did not: the grade stands on the samples that did. */
export interface DegradedSampleDto {
  /** The lens that ran it — `critic.scale`, `evaluator.quality`. */
  stage: string;
  sample: number | null;
  reason: DiagnosticReason;
}

export interface EvaluationDto {
  runId: string;
  /** Which iteration of the run this revision is: 1 for a submission, k for a coach revision. */
  iteration: number;
  /** When the run grading it started — what a timer counts from, on a reload as on a submit. */
  startedAt: IsoDateString;
  /** The run's last sign of life (`QualityRunDto.heartbeatAt`): what tells a live grade from a dead one still saying `running`. */
  heartbeatAt: IsoDateString;
  /**
   * When the studio read the run, on the server's clock: what a reader
   * measures `startedAt` and `heartbeatAt` against, so its own clock, however
   * far off, can neither raise a silence nor hide one.
   */
  readAt: IsoDateString;
  /**
   * This iteration's grade: complete once the run has recorded it — a coach's
   * earlier iterations finish while it is still revising — otherwise the
   * run's own state, and failed when the run ended without it.
   */
  status: QualityRunStatus;
  /**
   * Whether this grade can still change: false while the run is still
   * running — even once this iteration is `complete`, since whether it ends
   * the run, and why (`stopReason`), is known only when the run stops — and
   * true once the run has completed or failed. A reader polls until it is.
   */
  settled: boolean;
  llm: LlmModelDto;
  /**
   * The controller's score; null when the run has no iteration yet, and when
   * the iteration earned none (`unscored` says why) — never the controller's
   * zero for a ledger it could not judge.
   */
  overall: number | null;
  /** Why a complete grade has no score; null when it has one, and while there is no grade yet. */
  unscored: UnscoredReason | null;
  decision: Decision | null;
  /** The controller's own sentence for its decision. */
  decisionReason: string | null;
  /** What settled the decision, for wording it; null while there is no grade. */
  decisionBasis: DecisionBasisDto | null;
  /**
   * Keyed by the pipeline's own dimension names; null means the dimension was
   * not assessed — every one of them, on a grade that is `unscored`.
   */
  dimensions: Record<string, number | null>;
  findings: EvaluationFindingDto[];
  criterionResults: CriterionResultDto[];
  /**
   * Why the run stopped, when that is news to the reader of this grade
   * (`gradeStopReason`): a coach run that used its budget or stopped
   * improving, on the iteration that ended it. Null on every earlier
   * iteration, on a stop the decision already states, and on a plain grade —
   * one judgement always ends on its budget of one.
   */
  stopReason: StopReason | null;
  /**
   * The lens samples of this iteration that should have answered and did not
   * (`DIAGNOSTIC_DEGRADES`); empty when every lens with something to judge
   * answered. A lens skipped as not applicable is not one.
   */
  degraded: DegradedSampleDto[];
  error: string | null;
}

export type GetEvaluationResponse = ApiResponse<EvaluationDto>;

/**
 * Whether a revision's grade may be run again in place: it failed, or it
 * stands on too little evidence to be a verdict. A grade that is one stands.
 * The API's rule — anything else is refused with a 409 — and the offer a
 * reader makes alike; a revision with no grade at all may always be graded.
 */
export const regradable = (grade: Pick<EvaluationDto, 'status' | 'unscored'>): boolean =>
  grade.status === 'failed' || grade.unscored === 'unassessed';

/**
 * `GET /grading/availability`: the grader — and so the coach — can run, on
 * this model, and its runs keep this pace (the loop's own, passed through). A
 * 503 when it cannot.
 */
export interface GradingAvailabilityDto {
  model: string;
  heartbeat: RunHeartbeatDto;
}
export type GetGradingAvailabilityResponse = ApiResponse<GradingAvailabilityDto>;
