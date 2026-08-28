import type {
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  EvaluationDto,
  FindingDto,
} from '@sysdesign/contracts';
import type { DesignRevision, Evaluation, Finding } from '@sysdesign/db';

/**
 * Evaluation and revision projections. Callers pass the evaluation alongside
 * the revision because the entity graph only points Evaluation → Revision;
 * the DTOs embed it the other way round.
 */

/** Deterministic order: ruleId (LLM findings, ruleId null, first), then id. */
const byRuleIdThenId = (a: Finding, b: Finding): number =>
  (a.ruleId ?? '').localeCompare(b.ruleId ?? '') || a.id.localeCompare(b.id);

const toFindingDto = (f: Finding): FindingDto => ({
  id: f.id,
  source: f.source,
  ruleId: f.ruleId,
  dimension: f.dimension,
  severity: f.severity,
  title: f.title,
  message: f.message,
  affectedNodeIds: f.affectedNodeIds,
  affectedEdgeIds: f.affectedEdgeIds,
  suggestion: f.suggestion,
});

/** Requires `findings` to be populated (or the entity to be freshly created). */
export const toEvaluationDto = (e: Evaluation): EvaluationDto => ({
  id: e.id,
  revisionId: e.revision.id,
  status: e.status,
  overallScore: e.overallScore,
  grade: e.grade,
  dimensionScores: e.dimensionScores,
  summary: e.summary,
  engineVersion: e.engineVersion,
  criticModel: e.criticModel,
  error: e.error,
  findings: [...e.findings.getItems()].sort(byRuleIdThenId).map(toFindingDto),
  startedAt: e.startedAt?.toISOString() ?? null,
  completedAt: e.completedAt?.toISOString() ?? null,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

/** Full revision, graph included. */
export const toRevisionDto = (
  r: DesignRevision,
  evaluation: Evaluation | null,
): DesignRevisionDto => ({
  id: r.id,
  sessionId: r.session.id,
  revisionNumber: r.revisionNumber,
  graph: r.graph,
  notes: r.notes,
  evaluation: evaluation ? toEvaluationDto(evaluation) : null,
  createdAt: r.createdAt.toISOString(),
});

/** List projection: everything but the graph, which can be large. */
export const toRevisionSummaryDto = (
  r: DesignRevision,
  evaluation: Evaluation | null,
): DesignRevisionSummaryDto => ({
  id: r.id,
  revisionNumber: r.revisionNumber,
  notes: r.notes,
  evaluationStatus: evaluation?.status ?? null,
  overallScore: evaluation?.overallScore ?? null,
  grade: evaluation?.grade ?? null,
  createdAt: r.createdAt.toISOString(),
});
