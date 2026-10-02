/**
 * A run's recall, as the run records it: whether lessons from earlier runs
 * were recalled for its goal before it produced, which recall run curated
 * them, and the lessons its producer was handed. A run asks for it with
 * `StartQualityRunRequest.recall`; the record is null on a run that did not.
 */
import { mayProduce, type QualityRunRequestSummary } from './runs';

/**
 * Where a run's recall stands. `recalling` while it runs — the run has not
 * produced yet. `recalled`: the producer was handed at least one lesson.
 * `empty`: recall ran and found nothing worth handing on. `skipped`: it could
 * not run. Only `recalled` hands the producer anything, and none of them
 * fails the run.
 */
export const RUN_RECALL_STATUSES = ['recalling', 'recalled', 'empty', 'skipped'] as const;
export type RunRecallStatus = (typeof RUN_RECALL_STATUSES)[number];

/**
 * Why a recall handed the producer nothing, and which of the two outcomes
 * that is — one table, so the status is never decided apart from the reason.
 * The memory steps' own reasons where they apply, plus the three only a run's
 * recall can give: a run that can never call its producer, no recall bound in
 * this process, and an error it did not expect.
 */
export const RUN_RECALL_REASON_STATUS = {
  'no-produce-iteration': 'skipped',
  'recall-unavailable': 'skipped',
  'embeddings-disabled': 'skipped',
  'store-unavailable': 'skipped',
  'pipeline-unavailable': 'skipped',
  'embedding-failed': 'skipped',
  'run-failed': 'skipped',
  errored: 'skipped',
  'store-empty': 'empty',
  'not-accepted': 'empty',
  'no-usable-memory': 'empty',
} as const satisfies Record<string, Extract<RunRecallStatus, 'empty' | 'skipped'>>;
export type RunRecallReason = keyof typeof RUN_RECALL_REASON_STATUS;
export const RUN_RECALL_REASONS = Object.keys(RUN_RECALL_REASON_STATUS) as RunRecallReason[];

/** One lesson a producer was handed: the stored lesson, and what the curator said it lends this goal. */
export interface RecalledLessonDto {
  /** The alias the curator kept it under (`m3`) — what the producer's prompt cites it by. */
  ref: string;
  /** The part of the goal the curator says it informs. */
  serves: string;
  /** What it teaches for this goal, in the stored lesson's own terms. */
  insight: string;
  /** How the lesson's context differs from this goal's, or null. */
  caveat: string | null;
  /** The stored lesson, verbatim. */
  text: string;
  /** The run the lesson was digested from. */
  sourceRunId: string;
}

/** The recall as a list row carries it: everything but the lessons. */
export interface RunRecallSummaryDto {
  status: RunRecallStatus;
  /** Null while recalling and when lessons were recalled; one of the closed reasons otherwise. */
  reason: RunRecallReason | null;
  /** The cause behind the reason, when there is one — never a credential. */
  note: string | null;
  /** The memory-recall run that curated the lessons; null until it opens, and when none ran. */
  recallRunId: string | null;
  /** How many lessons the producer was handed. */
  count: number;
}

export interface RunRecallDto extends RunRecallSummaryDto {
  /** Exactly what the producer was handed, in the order it saw them. */
  lessons: RecalledLessonDto[];
}

/** The recall a run records as it opens, before anything is known. */
export const recallInProgress = (): RunRecallDto => ({
  status: 'recalling',
  reason: null,
  note: null,
  recallRunId: null,
  count: 0,
  lessons: [],
});

/** A recall that handed the producer nothing, its status read from the reason. */
export const recallWithout = (
  reason: RunRecallReason,
  note: string | null = null,
  recallRunId: string | null = null,
): RunRecallDto => ({
  status: RUN_RECALL_REASON_STATUS[reason],
  reason,
  note,
  recallRunId,
  count: 0,
  lessons: [],
});

/**
 * The recall a run records as it opens, decided from its request alone: none
 * when it did not ask; `skipped` with `no-produce-iteration` when it can never
 * call its producer (`mayProduce`) — lessons reach no other stage, so recalling
 * them would brief nobody, and no recall run is opened; `recalling` otherwise.
 */
export const openingRecall = (
  asked: boolean,
  request: QualityRunRequestSummary,
): RunRecallDto | null => {
  if (!asked) return null;
  return mayProduce(request) ? recallInProgress() : recallWithout('no-produce-iteration');
};

/** A recall that handed the producer these lessons. */
export const recallOf = (
  lessons: readonly RecalledLessonDto[],
  recallRunId: string,
): RunRecallDto => ({
  status: 'recalled',
  reason: null,
  note: null,
  recallRunId,
  count: lessons.length,
  lessons: [...lessons],
});

/** The list row's view of a recall, picked field by field: everything but the lessons. */
export const recallSummary = (recall: RunRecallDto): RunRecallSummaryDto => ({
  status: recall.status,
  reason: recall.reason,
  note: recall.note,
  recallRunId: recall.recallRunId,
  count: recall.count,
});
