/**
 * Rows back into the wire record — the inverse of `toRows`, and of
 * `progressRows` while the run is still running. Inputs may arrive in any
 * order; every list is sorted by its own key here. Rows come in with the
 * entity's own fields spread over them, so what reaches the wire is picked
 * by name, never by leaving fields out.
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  IterationTrace,
  QualityRunDto,
} from '@sysdesign/contracts';

import { progressOf } from '../../../core/loop/progress';
import { toIso, toIsoOrNull } from './conventions';
import {
  byPosition,
  groupBy,
  type CriterionRow,
  type FindingRow,
  type IterationRow,
  type QualityRunRow,
  type ResultRow,
} from './rows';

const FINDING_FIELDS = [
  'key',
  'type',
  'severity',
  'confidence',
  'fixability',
  'locationRefs',
  'criterionIds',
  'hits',
  'lenses',
  'rationale',
  'reconciledTo',
] as const satisfies readonly (keyof ConfirmedFinding)[];

const RESULT_FIELDS = [
  'criterionId',
  'kind',
  'result',
  'hits',
  'confidence',
  'locationRefs',
] as const satisfies readonly (keyof CriterionEvidence)[];

/** Exactly these fields, in this order — a row carries more than the wire says. */
const pick = <T, K extends keyof T>(row: T, keys: readonly K[]): Pick<T, K> =>
  Object.fromEntries(keys.map((key) => [key, row[key]])) as Pick<T, K>;

/** One iteration with its ledger reassembled from its findings and results. */
function iterationFromRows(
  row: IterationRow,
  findings: readonly FindingRow[],
  results: readonly ResultRow[],
): IterationTrace {
  return {
    iteration: row.iteration,
    mode: row.mode,
    artifact: row.artifact,
    locations: row.locations,
    rendered: row.rendered,
    validation: row.validation,
    critics: row.critics,
    evaluators: row.evaluators,
    ledger: {
      artifactPresent: row.artifactPresent,
      validation: row.validation,
      criteria: [...results].sort(byPosition).map((result) => pick(result, RESULT_FIELDS)),
      findings: [...findings].sort(byPosition).map((finding) => pick(finding, FINDING_FIELDS)),
      discarded: row.discarded,
      diagnostics: row.diagnostics,
    },
    decision: row.decision,
    remediations: row.remediations,
    durationMs: row.durationMs,
  };
}

/**
 * The trace: settled, when the header says the run recorded one; the run so
 * far, while it is still running — the iterations its progress wrote, with
 * the standing the loop itself would publish over them; otherwise none.
 */
function traceFromRows(
  run: QualityRunRow,
  criteria: readonly CriterionRow[],
  iterations: readonly IterationRow[],
  findings: readonly FindingRow[],
  results: readonly ResultRow[],
): QualityRunDto['trace'] {
  const findingsByIteration = groupBy(findings, (row) => row.iterationId);
  const resultsByIteration = groupBy(results, (row) => row.iterationId);
  const head = {
    pipeline: { id: run.pipeline, version: run.pipelineVersion ?? '' },
    contract: {
      goal: run.request.goal,
      criteria: [...criteria]
        .sort(byPosition)
        .map(({ criterionId, kind, statement }) => ({ id: criterionId, kind, statement })),
    },
  };
  const recorded = [...iterations]
    .sort((a, b) => a.iteration - b.iteration)
    .map((row) =>
      iterationFromRows(
        row,
        findingsByIteration.get(row.id) ?? [],
        resultsByIteration.get(row.id) ?? [],
      ),
    );
  if (run.finalDecision !== null && run.stopReason !== null && run.bestIteration !== null) {
    return {
      ...head,
      iterations: recorded,
      bestIteration: run.bestIteration,
      finalDecision: run.finalDecision,
      stopReason: run.stopReason,
      lessons: run.lessons ?? [],
    };
  }
  return run.status === 'running' ? progressOf(head, recorded) : null;
}

export function fromRows(
  run: QualityRunRow,
  criteria: readonly CriterionRow[],
  iterations: readonly IterationRow[],
  findings: readonly FindingRow[],
  results: readonly ResultRow[],
): QualityRunDto {
  return {
    runId: run.id,
    pipeline: run.pipeline,
    status: run.status,
    startedAt: toIso(run.startedAt),
    finishedAt: toIsoOrNull(run.finishedAt),
    llm: run.llm,
    // Rows written before a run could carry its rubric have no flag: it was
    // derived; before a run could adopt an iteration, none was adopted.
    request: {
      ...run.request,
      criteriaProvided: run.request.criteriaProvided ?? false,
      adoptedFrom: run.request.adoptedFrom ?? null,
    },
    trace: traceFromRows(run, criteria, iterations, findings, results),
    exchanges: run.exchanges,
    error: run.error,
  };
}
