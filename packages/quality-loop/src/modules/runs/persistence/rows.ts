/**
 * The wire record as table rows: the entities' columns with relations
 * flattened to ids, so the mappers never touch the ORM and the repository
 * copies rows into entities and back. The ledger splits across rows —
 * criteria → results, findings → findings, the rest on the iteration — and
 * `fromRows(toRows(r))` deep equals `toRunDto(r)`.
 */
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
  LlmModelDto,
  LlmExchangeSummaryDto,
  QualityControlDecision,
  QualityRunRequestSummary,
  QualityRunStatus,
  RemediationNote,
  RunErrorDto,
  RunRecallDto,
  Severity,
  StopReason,
  ValidationReport,
} from '@sysdesign/contracts';
import type { GitContext } from '@sysdesign/run-dump';

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
  llm: LlmModelDto;
  request: QualityRunRequestSummary;
  parentRunId: string | null;
  recall: RunRecallDto | null;
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

export const byPosition = <T extends { position: number }>(a: T, b: T): number =>
  a.position - b.position;

export function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row)) ?? [];
    list.push(row);
    groups.set(key(row), list);
  }
  return groups;
}
