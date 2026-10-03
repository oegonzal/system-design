/**
 * Did a recalled lesson go with a run whose defects then resolved?
 *
 * Every coach run that recalls records which lessons its producer was handed and
 * which defects the recall searched for; the engine records, per iteration, what
 * resolved, persisted, improved or regressed. Nothing joins the two, so the one
 * question the memory tier exists to answer has never had an answer. This is the
 * join, as a pure function over records already written.
 *
 * The attribution is deliberately **run-level**, and the DTO says so. Which
 * lesson served which defect is prose on the curator's pack (`serves` is a
 * sentence), so tying one lesson to one outcome would mean reading it. A run's
 * lessons are reported beside that run's outcomes and nothing claims more. The
 * honest fix is for the curator to cite the defect by alias; that is a
 * memory-recall change, and until then this is what the records support.
 */
import type {
  EffectivenessChunkDto,
  EffectivenessRunDto,
  FocusOutcomeDto,
  IterationTrace,
  Lesson,
  QualityRunDto,
  RecallFocusDto,
  RecalledLessonDto,
  RecallEffectivenessDto,
  TransitionKind,
} from '@sysdesign/contracts';

import { readIndex as readRecallIndex } from '../../../pipelines/memory-recall/input';
import { rankedFocusFindings } from '../../../orchestrators/memory/recall/focus';

/** What the effectiveness report needs of one run: the run itself, and the recall run it opened. */
export interface RecallingRun {
  run: QualityRunDto;
  /** The memory-recall run that curated the lessons; absent when it is no longer stored. */
  recall: QualityRunDto | null;
}

const outcomeOf = (
  lessons: readonly Lesson[],
  subject: string,
  from: number,
  hasNext: boolean,
): FocusOutcomeDto['outcome'] => {
  const lesson = lessons.find(
    (candidate) => candidate.subject === subject && candidate.iterations[0] === from,
  );
  if (lesson !== undefined) return lesson.kind as TransitionKind;
  return hasNext ? 'unchanged' : 'no-next-iteration';
};

/**
 * The iteration a run started from — the one whose defects the recall searched
 * for. A coach adopts the judged iteration it is revising, so that is the base;
 * a run that produced from nothing has its first.
 */
const baseOf = (run: QualityRunDto): IterationTrace | null => run.trace?.iterations[0] ?? null;

/**
 * What became of each defect the recall searched for. The findings are matched
 * by the order `focusOf` chose them in — the same comparator, exported from the
 * focus so the two cannot drift — because the focus records a finding's type and
 * words, not its key.
 */
export function focusOutcomes(run: QualityRunDto, focus: RecallFocusDto): FocusOutcomeDto[] {
  const trace = run.trace;
  const base = baseOf(run);
  if (trace === null || base === null) return [];
  const hasNext = trace.iterations.some((iteration) => iteration.iteration > base.iteration);
  const ranked = rankedFocusFindings(base.ledger);
  const findings: FocusOutcomeDto[] = focus.findings.map((named, position) => {
    const finding = ranked[position];
    return {
      subject: finding?.key ?? named.type,
      kind: 'finding',
      from: null,
      outcome:
        finding === undefined
          ? 'no-next-iteration'
          : outcomeOf(trace.lessons, finding.key, base.iteration, hasNext),
    };
  });
  const criteria: FocusOutcomeDto[] = focus.criteria.map((named) => ({
    subject: named.criterionId,
    kind: 'criterion',
    from: named.result,
    outcome: outcomeOf(trace.lessons, named.criterionId, base.iteration, hasNext),
  }));
  return [...findings, ...criteria];
}

/** Resolved and improved are the outcomes a lesson could have helped toward; the rest are not. */
const WENT_WELL: readonly FocusOutcomeDto['outcome'][] = ['resolved', 'improved'];

/** The share of the defects searched for that resolved or improved; null when nothing judged them again. */
export function resolvedShare(outcomes: readonly FocusOutcomeDto[]): number | null {
  const judged = outcomes.filter((outcome) => outcome.outcome !== 'no-next-iteration');
  if (judged.length === 0) return null;
  return judged.filter((outcome) => WENT_WELL.includes(outcome.outcome)).length / judged.length;
}

/**
 * Each lesson the producer was handed, with how far it got through the recall it
 * came from: the point it was stored under (read from the recall run's own goal
 * index, which is structural), whether the curator kept it, and whether it
 * reached the producer.
 */
export function briefedLessons(entry: RecallingRun): EffectivenessRunDto['lessons'] {
  const recall = entry.run.recall;
  if (recall === null) return [];
  const index = entry.recall === null ? null : readRecallIndex(entry.recall.request.goal);
  const sourceOf = new Map(
    (index?.candidates ?? []).map((candidate) => [candidate.alias, candidate.source]),
  );
  const kept = new Set(keptAliases(entry.recall));
  const briefed = new Map(recall.lessons.map((lesson: RecalledLessonDto) => [lesson.ref, lesson]));
  const aliases = new Set([...sourceOf.keys(), ...briefed.keys()]);
  return [...aliases].map((alias) => {
    const source = sourceOf.get(alias);
    const lesson = briefed.get(alias);
    return {
      ref: alias,
      sourceRunId: source?.runId ?? lesson?.sourceRunId ?? '',
      sourceRef: source?.ref ?? '',
      offered: sourceOf.has(alias),
      kept: kept.has(alias),
      briefed: briefed.has(alias),
    };
  });
}

/** The aliases the curator kept, read off the recall run's own artifact. */
function keptAliases(recall: QualityRunDto | null): string[] {
  const trace = recall?.trace ?? null;
  if (trace === null) return [];
  const best =
    trace.iterations.find((iteration) => iteration.iteration === trace.bestIteration) ??
    trace.iterations[trace.iterations.length - 1];
  const artifact = best?.artifact as { kept?: { chunk?: unknown }[] } | null | undefined;
  return (artifact?.kept ?? []).flatMap((item) =>
    typeof item.chunk === 'string' ? [item.chunk] : [],
  );
}

/** One run's row: what it was handed, what its defects did, and how much of them went well. */
export function effectivenessOf(entry: RecallingRun): EffectivenessRunDto {
  const recall = entry.run.recall;
  const outcomes = recall?.focus == null ? [] : focusOutcomes(entry.run, recall.focus);
  return {
    runId: entry.run.runId,
    pipeline: entry.run.pipeline,
    recallRunId: recall?.recallRunId ?? null,
    baseIteration: baseOf(entry.run)?.iteration ?? null,
    lessons: briefedLessons(entry),
    focus: outcomes,
    focusResolvedShare: resolvedShare(outcomes),
  };
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;

/** Every stored item that reached a producer, with how often it did and how those runs went. */
export function chunkRows(runs: readonly EffectivenessRunDto[]): EffectivenessChunkDto[] {
  const rows = new Map<string, EffectivenessChunkDto & { shares: number[] }>();
  for (const run of runs) {
    for (const lesson of run.lessons) {
      if (lesson.sourceRunId === '') continue;
      const key = `${lesson.sourceRunId}|${lesson.sourceRef}`;
      const row =
        rows.get(key) ??
        ({
          sourceRunId: lesson.sourceRunId,
          ref: lesson.sourceRef,
          offered: 0,
          kept: 0,
          briefed: 0,
          runsWithAnyFocusResolved: 0,
          meanFocusResolvedShare: null,
          shares: [],
        } satisfies EffectivenessChunkDto & { shares: number[] });
      row.offered += lesson.offered ? 1 : 0;
      row.kept += lesson.kept ? 1 : 0;
      if (lesson.briefed) {
        row.briefed += 1;
        if (run.focusResolvedShare !== null) {
          row.shares.push(run.focusResolvedShare);
          if (run.focusResolvedShare > 0) row.runsWithAnyFocusResolved += 1;
        }
      }
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map(({ shares, ...row }) => ({ ...row, meanFocusResolvedShare: mean(shares) }))
    .sort((a, b) => b.briefed - a.briefed || a.sourceRunId.localeCompare(b.sourceRunId));
}

/** The report: one row per recalling run, and one per stored item those runs drew on. */
export function recallEffectiveness(
  entries: readonly RecallingRun[],
  scanned: number,
): RecallEffectivenessDto {
  const runs = entries.map(effectivenessOf);
  return { scanned, attribution: 'run-level', runs, chunks: chunkRows(runs) };
}
