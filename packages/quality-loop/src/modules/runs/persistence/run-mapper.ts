import type {
  ArtifactLocation,
  AxisFactorLevel,
  CriticReport,
  Decision,
  Diagnostic,
  DiscardedItem,
  EvaluationReport,
  EvidenceResult,
  Fixability,
  IterationTrace,
  LensOutcome,
  Lesson,
  LlmAvailabilityDto,
  LlmExchangeSummaryDto,
  QualityControlDecision,
  QualityRunDto,
  QualityRunRequestSummary,
  QualityRunStatus,
  QualityRunSummaryDto,
  RemediationNote,
  RunErrorDto,
  Severity,
  StopReason,
  ValidationReport,
} from '@sysdesign/contracts';
import type { GitContext } from '@sysdesign/run-dump';

import { toRunDto, type RunRecord } from '../../../core/contracts';

/**
 * The wire record ⇄ table rows, as pure functions. Row shapes are the
 * entities' columns with relations flattened to ids, so nothing here touches
 * the ORM; the repository copies rows into entities and back. The ledger
 * splits across rows (criteria → results, findings → findings, the rest on
 * the iteration) and is reassembled exactly — `fromRows(toRows(r))` deep
 * equals `toRunDto(r)`.
 */

export interface QualityRunRow {
  id: string;
  pipeline: string;
  pipelineVersion: string | null;
  status: QualityRunStatus;
  finalDecision: Decision | null;
  stopReason: StopReason | null;
  overall: number | null;
  bestIteration: number | null;
  exchangeCount: number;
  llm: LlmAvailabilityDto;
  request: QualityRunRequestSummary;
  git: GitContext;
  exchanges: LlmExchangeSummaryDto[];
  lessons: Lesson[] | null;
  error: RunErrorDto | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface CriterionRow {
  runId: string;
  position: number;
  criterionId: string;
  kind: string;
  statement: string;
}

export interface IterationRow {
  id: string;
  runId: string;
  iteration: number;
  mode: IterationTrace['mode'];
  artifact: unknown;
  rendered: string | null;
  locations: ArtifactLocation[];
  validation: ValidationReport[];
  critics: LensOutcome<CriticReport>[];
  evaluators: LensOutcome<EvaluationReport>[];
  artifactPresent: boolean;
  discarded: DiscardedItem[];
  diagnostics: Diagnostic[];
  decision: QualityControlDecision;
  remediations: RemediationNote[];
  durationMs: number;
}

export interface FindingRow {
  iterationId: string;
  runId: string;
  position: number;
  key: string;
  type: string;
  severity: Severity;
  confidence: AxisFactorLevel;
  fixability: Fixability;
  locationRefs: string[];
  criterionIds: string[];
  hits: number;
  lenses: string[];
  rationale: string | null;
  reconciledTo: string | null;
}

export interface ResultRow {
  iterationId: string;
  runId: string;
  position: number;
  criterionId: string;
  kind: string;
  result: EvidenceResult;
  hits: number;
  confidence: AxisFactorLevel | null;
  locationRefs: string[];
}

export interface RunRows {
  run: QualityRunRow;
  criteria: CriterionRow[];
  iterations: { row: IterationRow; findings: FindingRow[]; results: ResultRow[] }[];
}

const byPosition = <T extends { position: number }>(a: T, b: T): number => a.position - b.position;

/** The record as rows. `newId` mints iteration ids so their children can point at them. */
export function toRows(
  record: RunRecord,
  newId: () => string = () => crypto.randomUUID(),
): RunRows {
  const dto = toRunDto(record);
  const trace = dto.trace;
  const best = trace?.iterations.find((entry) => entry.iteration === trace.bestIteration) ?? null;
  const run: QualityRunRow = {
    id: dto.runId,
    pipeline: dto.pipeline,
    pipelineVersion: trace?.pipeline.version ?? null,
    status: dto.status,
    finalDecision: trace?.finalDecision ?? null,
    stopReason: trace?.stopReason ?? null,
    overall: best?.decision.scores.overall ?? null,
    bestIteration: trace?.bestIteration ?? null,
    exchangeCount: dto.exchanges.length,
    llm: dto.llm,
    request: dto.request,
    git: record.git,
    exchanges: dto.exchanges,
    lessons: trace?.lessons ?? null,
    error: dto.error,
    startedAt: new Date(dto.startedAt),
    finishedAt: dto.finishedAt === null ? null : new Date(dto.finishedAt),
  };
  const criteria = (trace?.contract.criteria ?? []).map((criterion, position) => ({
    runId: dto.runId,
    position,
    criterionId: criterion.id,
    kind: criterion.kind,
    statement: criterion.statement,
  }));
  const iterations = (trace?.iterations ?? []).map((entry) => {
    const id = newId();
    const { ledger } = entry;
    return {
      row: {
        id,
        runId: dto.runId,
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
        runId: dto.runId,
        position,
        ...finding,
      })),
      results: ledger.criteria.map((evidence, position) => ({
        iterationId: id,
        runId: dto.runId,
        position,
        ...evidence,
      })),
    };
  });
  return { run, criteria, iterations };
}

/** Inverse of `toRows`. Inputs may arrive in any order; every list is sorted by its own key here. */
export function fromRows(
  run: QualityRunRow,
  criteria: readonly CriterionRow[],
  iterations: readonly IterationRow[],
  findings: readonly FindingRow[],
  results: readonly ResultRow[],
): QualityRunDto {
  const findingsByIteration = groupBy(findings, (row) => row.iterationId);
  const resultsByIteration = groupBy(results, (row) => row.iterationId);

  const trace: QualityRunDto['trace'] =
    run.finalDecision === null || run.stopReason === null || run.bestIteration === null
      ? null
      : {
          pipeline: { id: run.pipeline, version: run.pipelineVersion ?? '' },
          contract: {
            goal: run.request.goal,
            criteria: [...criteria]
              .sort(byPosition)
              .map(({ criterionId, kind, statement }) => ({ id: criterionId, kind, statement })),
          },
          iterations: [...iterations]
            .sort((a, b) => a.iteration - b.iteration)
            .map((row) => ({
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
                criteria: (resultsByIteration.get(row.id) ?? [])
                  .sort(byPosition)
                  .map(({ criterionId, kind, result, hits, confidence, locationRefs }) => ({
                    criterionId,
                    kind,
                    result,
                    hits,
                    confidence,
                    locationRefs,
                  })),
                findings: (findingsByIteration.get(row.id) ?? [])
                  .sort(byPosition)
                  .map(
                    ({
                      key,
                      type,
                      severity,
                      confidence,
                      fixability,
                      locationRefs,
                      criterionIds,
                      hits,
                      lenses,
                      rationale,
                      reconciledTo,
                    }) => ({
                      key,
                      type,
                      severity,
                      confidence,
                      fixability,
                      locationRefs,
                      criterionIds,
                      hits,
                      lenses,
                      rationale,
                      reconciledTo,
                    }),
                  ),
                discarded: row.discarded,
                diagnostics: row.diagnostics,
              },
              decision: row.decision,
              remediations: row.remediations,
              durationMs: row.durationMs,
            })),
          bestIteration: run.bestIteration,
          finalDecision: run.finalDecision,
          stopReason: run.stopReason,
          lessons: run.lessons ?? [],
        };

  return {
    runId: run.id,
    pipeline: run.pipeline,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    llm: run.llm,
    // Rows written before a run could carry its rubric have no flag: it was derived.
    request: { ...run.request, criteriaProvided: run.request.criteriaProvided ?? false },
    trace,
    exchanges: run.exchanges,
    error: run.error,
  };
}

/** The list row: the header plus the two counts the repository supplies. */
export function toSummary(
  run: QualityRunRow,
  counts: { iterations: number; criteria: number },
): QualityRunSummaryDto {
  return {
    runId: run.id,
    pipeline: run.pipeline,
    pipelineVersion: run.pipelineVersion,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    finalDecision: run.finalDecision,
    stopReason: run.stopReason,
    overall: run.overall,
    iterations: counts.iterations,
    criteria: counts.criteria,
    exchangeCount: run.exchangeCount,
    llm: run.llm,
  };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row)) ?? [];
    list.push(row);
    groups.set(key(row), list);
  }
  return groups;
}
