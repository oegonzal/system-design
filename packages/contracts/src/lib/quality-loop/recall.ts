/**
 * A run's recall, as the run records it: whether lessons from earlier runs
 * were recalled for its goal before it produced, which recall run curated
 * them, and the lessons its producer was handed. A run asks for it with
 * `StartQualityRunRequest.recall`; the record is null on a run that did not.
 */
import type { EvidenceResult } from './evidence';
import { mayProduce, type AdoptedIterationRef, type QualityRunRequestSummary } from './runs';
import type { Severity } from './vocab';

/**
 * Where the evidence a stored lesson cites was judged, beyond the run that
 * stored it. A run that adopts a recorded iteration copies its ledger
 * verbatim, so a lesson digested from the copy restates what the original
 * run's digest already taught; the lineage is what lets a recall tell the
 * copy from the original without reading either run back. `judged` is the
 * run and iteration whose judges produced the cited evidence: the source
 * run's own best iteration, or — when its best is the one it adopted — the
 * iteration it adopted. `goalHash` is sha-256 hex of the bare goal the source
 * run was asked, so runs of one prompt are kin by hash, never by text.
 */
export interface MemoryLineageDto {
  judged: AdoptedIterationRef;
  /** What the source run adopted as its iteration 1; null when it produced or judged its own. */
  adoptedFrom: AdoptedIterationRef | null;
  goalHash: string;
}

/**
 * Where an offered lesson was learned, as near to the run that recalls it as
 * the store can say: an iteration of the chain that run starts from, later
 * than the one it holds (`chain`); another run of the same prompt, kin by goal
 * hash (`same-prompt`); another prompt the same pipeline judged
 * (`same-pipeline`); or another pipeline altogether. Read from the stored
 * source and lineage, never from a lesson's text, and shown to the curator
 * beside each candidate's provenance.
 */
export const RECALL_ORIGINS = ['chain', 'same-prompt', 'same-pipeline', 'other-pipeline'] as const;
export type RecallOrigin = (typeof RECALL_ORIGINS)[number];

/**
 * Why a recall for a producer that revises a judged answer set a stored
 * lesson aside before the curator saw it — the first that matches.
 * `chain-iteration`: it was digested from a run that answer descends from, at
 * an iteration no later than the one the producer holds. `sibling-copy`: the
 * evidence it cites was judged in exactly an iteration of that chain — its own
 * run copied what the producer holds. `known-evidence`: of the same pipeline
 * — and the same prompt, when its lineage records one — and every finding it
 * cites is one the producer already holds.
 */
export const RECALL_EXCLUSION_REASONS = [
  'chain-iteration',
  'sibling-copy',
  'known-evidence',
] as const;
export type RecallExclusionReason = (typeof RECALL_EXCLUSION_REASONS)[number];

/** What a screen does with a lesson a reason matched: set it aside, or rank it after every other. */
export const RECALL_SCREEN_ACTIONS = ['exclude', 'demote'] as const;
export type RecallScreenAction = (typeof RECALL_SCREEN_ACTIONS)[number];

/** A stored lesson a screen matched, by where it is stored — it was never offered, so it has no alias. */
export interface RecallScreenedDto {
  sourceRunId: string;
  /** The chunk's ref in its source run (`memory.3`). */
  ref: string;
  /** The iteration of its source run it was learned from. */
  iteration: number;
  reason: RecallExclusionReason;
  /** What it matched: the chain entry as `run@iteration`, or the held finding keys it cites. */
  matched: string[];
}

/** Where an offered lesson was learned, by the alias the curator was shown it under. */
export interface RecallOriginDto {
  ref: string;
  sourceRunId: string;
  origin: RecallOrigin;
}

/**
 * What a recall for a producer that revises a judged answer screened out as
 * already in hand: the chain that answer descends from, how much the producer
 * holds, how many lessons came back and how many were collapsed as twins,
 * excluded or demoted by reason, or offered — and, for each offered one, its
 * origin. Null on a recall over the goal alone, which screens nothing.
 */
export interface RecallNoveltyDto {
  /** The iteration the producer starts from, then each iteration its run had adopted in turn. */
  chain: AdoptedIterationRef[];
  /** How many findings, criterion results and remediation notes the producer holds. */
  known: { findings: number; criteria: number; remediations: number };
  /** How many lessons the search came back with, deduped, before the screen. */
  pool: number;
  /** Lessons folded into a twin resting on the same evidence of the same prompt. */
  collapsed: number;
  /** How many the curator was offered. */
  offered: number;
  excluded: RecallScreenedDto[];
  demoted: RecallScreenedDto[];
  origins: RecallOriginDto[];
}

/**
 * Where a run's recall stands. `recalling` while it runs — the run has not
 * produced yet. `recalled`: the producer was handed at least one lesson.
 * `empty`: recall ran and found nothing worth handing on. `skipped`: it could
 * not run — or ran and could not be judged, which is no verdict on what it
 * found. Only `recalled` hands the producer anything, and none of them fails
 * the run.
 */
export const RUN_RECALL_STATUSES = ['recalling', 'recalled', 'empty', 'skipped'] as const;
export type RunRecallStatus = (typeof RUN_RECALL_STATUSES)[number];

/**
 * Why a recall handed the producer nothing, and which of the two outcomes
 * that is — one table, so the status is never decided apart from the reason.
 * The memory steps' own reasons where they apply, plus the three only a run's
 * recall can give: a run that can never call its producer, no recall bound in
 * this process, and an error it did not expect. `nothing-new` is a search
 * whose every lesson the producer already held: a verdict on what it found.
 */
export const RUN_RECALL_REASON_STATUS = {
  'no-produce-iteration': 'skipped',
  'recall-unavailable': 'skipped',
  'embeddings-disabled': 'skipped',
  'store-unavailable': 'skipped',
  'pipeline-unavailable': 'skipped',
  'embedding-failed': 'skipped',
  'query-refused': 'skipped',
  'run-failed': 'skipped',
  'no-rubric': 'skipped',
  'no-artifact': 'skipped',
  errored: 'skipped',
  'store-empty': 'empty',
  'not-accepted': 'empty',
  'no-usable-memory': 'empty',
  'nothing-new': 'empty',
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

/** A defect a recall searched for: one confirmed finding of the iteration the run started from. */
export interface RecallFocusFindingDto {
  /** The finding's type, as its pipeline declares it (`unhandled_failure`). */
  type: string;
  severity: Severity;
  /** The first words a critic gave it, capped; null when none did. */
  rationale: string | null;
}

/** A criterion the iteration the run started from failed, or met only in part. */
export interface RecallFocusCriterionDto {
  criterionId: string;
  /** What the criterion asks, capped. */
  statement: string;
  result: Extract<EvidenceResult, 'fail' | 'partial'>;
}

/**
 * What a recall searched for beyond its prompt: what was wrong with the
 * iteration the run started from — its confirmed findings, worst first, and
 * the criteria it fell short on — so the lessons recalled target the defects
 * the producer is about to revise. Null on a recall over the prompt alone: a
 * run that did not start from a judged iteration has none to name.
 */
export interface RecallFocusDto {
  /** The run and iteration the defects were read from. */
  runId: string;
  iteration: number;
  findings: RecallFocusFindingDto[];
  criteria: RecallFocusCriterionDto[];
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
  /**
   * The defects the recall searched for beside the prompt — null when it
   * searched for the prompt alone, and on every record older than the focus.
   */
  focus: RecallFocusDto | null;
  /**
   * What the recall screened out as already in the producer's hands — null
   * when it screened nothing, and on every record older than the screen.
   */
  novelty: RecallNoveltyDto | null;
}

/** The recall a run records as it opens, before anything is known. */
export const recallInProgress = (): RunRecallDto => ({
  status: 'recalling',
  reason: null,
  note: null,
  recallRunId: null,
  count: 0,
  lessons: [],
  focus: null,
  novelty: null,
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
  focus: null,
  novelty: null,
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
  focus: null,
  novelty: null,
});

/** A recall's record with the defects it searched for beside its prompt. */
export const withRecallFocus = (
  recall: RunRecallDto,
  focus: RecallFocusDto | null,
): RunRecallDto => ({ ...recall, focus });

/** A recall's record with what it screened out as already in the producer's hands. */
export const withRecallNovelty = (
  recall: RunRecallDto,
  novelty: RecallNoveltyDto | null,
): RunRecallDto => ({ ...recall, novelty });

/** The list row's view of a recall, picked field by field: everything but the lessons. */
export const recallSummary = (recall: RunRecallDto): RunRecallSummaryDto => ({
  status: recall.status,
  reason: recall.reason,
  note: recall.note,
  recallRunId: recall.recallRunId,
  count: recall.count,
});
