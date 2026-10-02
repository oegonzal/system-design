/** The record as rows: a header, the contract's criteria, and each iteration with its ledger split out. */
import type { IterationTrace, QualityRunDto, SuccessCriterion } from '@sysdesign/contracts';

import { isSettled, toRunDto, type RunProgress, type RunRecord } from '../../../core/contracts';
import { toDate, toDateOrNull } from './conventions';
import type { CriterionRow, QualityRunRow, RunRows } from './rows';

/**
 * The header row: the run as listed, plus what the trace settled. Progress —
 * a running run's, or what a failed one recorded — settled nothing, so its
 * standing stays in the iteration rows and the header says no verdict.
 */
function headerOf(record: RunRecord, dto: QualityRunDto): QualityRunRow {
  const trace = dto.trace;
  const settled = isSettled(trace) ? trace : null;
  const best =
    settled?.iterations.find((entry) => entry.iteration === settled.bestIteration) ?? null;
  return {
    id: dto.runId,
    pipeline: dto.pipeline,
    pipelineVersion: trace?.pipeline.version ?? null,
    status: dto.status,
    finalDecision: settled?.finalDecision ?? null,
    stopReason: settled?.stopReason ?? null,
    overall: best?.decision.scores.overall ?? null,
    bestIteration: settled?.bestIteration ?? null,
    exchangeCount: dto.exchanges.length,
    llm: dto.llm,
    request: dto.request,
    parentRunId: dto.parentRunId,
    recall: dto.recall,
    git: record.git,
    exchanges: dto.exchanges,
    lessons: settled?.lessons ?? null,
    error: dto.error,
    startedAt: toDate(dto.startedAt),
    finishedAt: toDateOrNull(dto.finishedAt),
    heartbeatAt: toDate(dto.heartbeatAt),
  };
}

const criteriaRows = (runId: string, criteria: readonly SuccessCriterion[]): CriterionRow[] =>
  criteria.map((criterion, position) => ({
    runId,
    position,
    criterionId: criterion.id,
    kind: criterion.kind,
    statement: criterion.statement,
  }));

/** Every iteration as its own row, its findings and results as rows pointing at it. */
const iterationRows = (
  runId: string,
  iterations: readonly IterationTrace[],
  newId: () => string,
): RunRows['iterations'] =>
  iterations.map((entry) => {
    const id = newId();
    const { ledger } = entry;
    return {
      row: {
        id,
        runId,
        iteration: entry.iteration,
        mode: entry.mode,
        artifact: entry.artifact,
        rendered: entry.rendered,
        locations: entry.locations,
        validation: entry.validation,
        critics: entry.critics,
        evaluators: entry.evaluators,
        artifactPresent: ledger.artifactPresent,
        discarded: ledger.discarded,
        diagnostics: ledger.diagnostics,
        decision: entry.decision,
        remediations: entry.remediations,
        durationMs: entry.durationMs,
      },
      findings: ledger.findings.map((finding, position) => ({
        iterationId: id,
        runId,
        position,
        ...finding,
      })),
      results: ledger.criteria.map((evidence, position) => ({
        iterationId: id,
        runId,
        position,
        ...evidence,
      })),
    };
  });

/** The record as rows. `newId` mints iteration ids so their children can point at them. */
export function toRows(
  record: RunRecord,
  newId: () => string = () => crypto.randomUUID(),
): RunRows {
  const dto = toRunDto(record);
  return {
    run: headerOf(record, dto),
    criteria: criteriaRows(dto.runId, dto.trace?.contract.criteria ?? []),
    iterations: iterationRows(dto.runId, dto.trace?.iterations ?? [], newId),
  };
}

/** A running loop's progress as child rows — the same rows `toRows` writes, before there is a verdict. */
export function progressRows(
  runId: string,
  progress: RunProgress,
  newId: () => string = () => crypto.randomUUID(),
): Pick<RunRows, 'criteria' | 'iterations'> {
  return {
    criteria: criteriaRows(runId, progress.contract.criteria),
    iterations: iterationRows(runId, progress.iterations, newId),
  };
}
