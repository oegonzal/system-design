/**
 * The pure decision point: evidence artifacts + a profile in, scores, grade,
 * and summary out. Only findings and coverage feed the score math — axis,
 * scenario, and annotation artifacts pass through untouched, which is the
 * structural guarantee that LLM output can never move the deterministic
 * grade. No clock, no randomness: identical inputs, byte-identical result.
 */
import {
  EVAL_DIMENSIONS,
  type DimensionScores,
  type EvalDimension,
  type Grade,
  type Severity,
} from '@sysdesign/contracts';

import type {
  AnnotationArtifact,
  AxisArtifact,
  DiagnosticsArtifact,
  EngineFinding,
  EvidenceArtifact,
  ScenarioArtifact,
} from './artifacts';
import { gradeForScore, type EvalProfile } from './profile';

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface CapApplied {
  severity: Severity;
  count: number;
  maxGrade: Grade;
}

export interface AggregateResult {
  findings: EngineFinding[];
  dimensionScores: DimensionScores;
  overallScore: number;
  /** Grade the numeric bands alone would give, before any cap. */
  bandGrade: Grade;
  grade: Grade;
  capApplied: CapApplied | null;
  summary: string;
  axes: AxisArtifact[];
  scenarios: ScenarioArtifact | null;
  annotations: AnnotationArtifact | null;
  diagnostics: DiagnosticsArtifact[];
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable identity for sorting: rules have ruleIds, expectations have expectationIds. */
function sortKey(finding: EngineFinding): string {
  return finding.ruleId ?? finding.expectationId ?? '';
}

export function aggregate(
  artifacts: readonly EvidenceArtifact[],
  profile: EvalProfile,
): AggregateResult {
  const findings: EngineFinding[] = [];
  const axes: AxisArtifact[] = [];
  const diagnostics: DiagnosticsArtifact[] = [];
  let scenarios: ScenarioArtifact | null = null;
  let annotations: AnnotationArtifact | null = null;

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'findings':
        findings.push(...artifact.findings);
        break;
      case 'axis':
        axes.push(artifact);
        break;
      case 'scenarios':
        scenarios ??= artifact;
        break;
      case 'annotations':
        annotations ??= artifact;
        break;
      case 'diagnostics':
        diagnostics.push(artifact);
        break;
      case 'coverage':
        break; // consumed by the coverage scoring model when it lands
    }
  }

  findings.sort(
    (a, b) =>
      compareStrings(sortKey(a), sortKey(b)) ||
      compareStrings(a.affectedNodeIds.join(','), b.affectedNodeIds.join(',')),
  );

  const dimensionScores = scoreSubtractive(findings, profile);
  const overallScore = weightedOverall(dimensionScores, profile);
  const bandGrade = gradeForScore(overallScore, profile.scoring.gradeBands);

  return {
    findings,
    dimensionScores,
    overallScore,
    bandGrade,
    grade: bandGrade,
    capApplied: null,
    summary: composeSummary(findings, dimensionScores, overallScore, bandGrade),
    axes,
    scenarios,
    annotations,
    diagnostics,
  };
}

/** Every dimension starts at 100 and loses each violation's penalty, floored at 0. */
function scoreSubtractive(
  findings: readonly EngineFinding[],
  profile: EvalProfile,
): DimensionScores {
  const scores = {} as DimensionScores;
  for (const dimension of EVAL_DIMENSIONS) scores[dimension] = 100;
  for (const finding of findings) {
    if (!finding.countsAsViolation) continue;
    scores[finding.dimension] = Math.max(
      0,
      scores[finding.dimension] - profile.scoring.severityPenalties[finding.severity],
    );
  }
  return scores;
}

function weightedOverall(scores: DimensionScores, profile: EvalProfile): number {
  let total = 0;
  for (const dimension of EVAL_DIMENSIONS) {
    total += scores[dimension] * profile.scoring.dimensionWeights[dimension];
  }
  return Math.round(total * 10) / 10;
}

function composeSummary(
  findings: readonly EngineFinding[],
  scores: DimensionScores,
  overall: number,
  grade: Grade,
): string {
  // Info findings are footnotes, not problems — the summary leads with what hurts.
  const actionable = findings
    .filter((finding) => finding.severity !== 'info')
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        compareStrings(sortKey(a), sortKey(b)),
    );

  let strongest: EvalDimension = EVAL_DIMENSIONS[0];
  for (const dimension of EVAL_DIMENSIONS) {
    if (scores[dimension] > scores[strongest]) strongest = dimension;
  }

  if (actionable.length === 0) {
    return `No blocking issues found — the design covers the load-bearing concerns for this prompt. Every dimension holds at or near full marks, led by ${strongest} at ${scores[strongest]}/100. Overall ${overall}/100, grade ${grade}.`;
  }

  const topTitles = actionable.slice(0, 3).map((finding) => finding.title);
  const needs = actionable.length === 1 ? 'issue needs' : 'issues need';
  return `${actionable.length} ${needs} attention, led by: ${topTitles.join('; ')}. The strongest dimension is ${strongest} at ${scores[strongest]}/100. Overall ${overall}/100, grade ${grade}.`;
}
