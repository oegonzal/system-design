import type { CapAppliedDto, EvalAxisDto, ScenarioReportDto } from './eval-profile';
import type { ApiResponse } from './envelope';
import type { GraphPatch } from './patches';
import type { IsoDateString, Uuid } from './primitives';

export const EVAL_STATUSES = ['queued', 'running', 'complete', 'failed'] as const;
export type EvalStatus = (typeof EVAL_STATUSES)[number];

/** The rubric. Scores and findings are grouped by these. */
export const EVAL_DIMENSIONS = [
  'reliability',
  'scalability',
  'performance',
  'data',
  'messaging',
  'security',
  'hygiene',
] as const;
export type EvalDimension = (typeof EVAL_DIMENSIONS)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** rule = deterministic violation · expectation = unmet coverage · llm = advisory annotation. */
export const FINDING_SOURCES = ['rule', 'expectation', 'llm'] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

export const GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
export type Grade = (typeof GRADES)[number];

export type DimensionScores = Record<EvalDimension, number>;

export interface FindingDto {
  id: Uuid;
  source: FindingSource;
  /** Stable rule id (`reliability.single-db-no-replica`) — set only for rule findings. */
  ruleId: string | null;
  /** Stable expectation id (`exp.fst.db-failover`) — set only for coverage findings. */
  expectationId: string | null;
  /** The prompt NFR this finding proves unmet, when one motivated it. */
  nfrId: string | null;
  /** The adversarial scenario that produced this failure story, when one did. */
  scenarioId: string | null;
  dimension: EvalDimension;
  severity: Severity;
  title: string;
  /** The lesson: why this matters at the prompt's scale, not just what to change. */
  message: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  suggestion: GraphPatch | null;
}

export interface EvaluationDto {
  id: Uuid;
  revisionId: Uuid;
  status: EvalStatus;
  /** 0–100; null until complete. */
  overallScore: number | null;
  grade: Grade | null;
  dimensionScores: DimensionScores | null;
  summary: string | null;
  engineVersion: string | null;
  /** The rubric that produced this grade, for audit across profile evolution. */
  profileId: string | null;
  profileVersion: string | null;
  /** Set when critical findings lowered the letter below its numeric band. */
  capApplied: CapAppliedDto | null;
  /** Which model critiqued, or null when the deterministic engine ran alone. */
  criticModel: string | null;
  error: string | null;
  findings: FindingDto[];
  /** LLM-scored axes displayed beside the deterministic score, never merged into it. */
  axes: EvalAxisDto[];
  /** Adversarial scenario narrations; empty until the scenario pass runs. */
  scenarios: ScenarioReportDto[];
  startedAt: IsoDateString | null;
  completedAt: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type GetEvaluationResponse = ApiResponse<EvaluationDto>;
export type RetryEvaluationResponse = ApiResponse<EvaluationDto>;
