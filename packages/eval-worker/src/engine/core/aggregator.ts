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
  CoverageArtifact,
  DiagnosticsArtifact,
  EngineFinding,
  EvidenceArtifact,
  ScenarioArtifact,
} from './artifacts';
import { gradeForScore, type CoverageScoringPolicy, type EvalProfile } from './profile';

const SEVERITY_RANK: Record<Severity, number> = {
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

const GRADE_ORDER: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

export function aggregate(
  artifacts: readonly EvidenceArtifact[],
  profile: EvalProfile,
): AggregateResult {
  let findings: EngineFinding[] = [];
  const coverage: CoverageArtifact['entries'] = [];
  const axes: AxisArtifact[] = [];
  const diagnostics: DiagnosticsArtifact[] = [];
  let scenarios: ScenarioArtifact | null = null;
  let annotations: AnnotationArtifact | null = null;

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'findings':
        findings.push(...artifact.findings);
        break;
      case 'coverage':
        coverage.push(...artifact.entries);
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
    }
  }

  const policy = profile.scoring;
  findings = applySuppressions(findings, coverage, policy);

  findings.sort(
    (a, b) =>
      compareStrings(sortKey(a), sortKey(b)) ||
      compareStrings(a.affectedNodeIds.join(','), b.affectedNodeIds.join(',')),
  );

  const dimensionScores = scoreCoverage(findings, coverage, policy);
  const overallScore = weightedOverall(dimensionScores, policy.dimensionWeights);
  const bandGrade = gradeForScore(overallScore, policy.gradeBands);
  const { grade, capApplied } = applyGradeCaps(bandGrade, findings, policy);

  return {
    findings,
    dimensionScores,
    overallScore,
    bandGrade,
    grade,
    capApplied,
    summary: composeSummary(findings, dimensionScores, overallScore, grade),
    axes,
    scenarios,
    annotations,
    diagnostics,
  };
}

/**
 * One lesson, one finding: a rule finding is dropped when the policy pairs it
 * with an expectation the design leaves unmet — the unmet expectation already
 * carries the lesson (and the fix), so the rule would only double-charge it.
 */
function applySuppressions(
  findings: EngineFinding[],
  coverage: CoverageArtifact['entries'],
  policy: CoverageScoringPolicy,
): EngineFinding[] {
  if (policy.suppressions.length === 0) return findings;
  const unmet = new Set(coverage.filter((entry) => !entry.met).map((entry) => entry.expectationId));
  return findings.filter(
    (finding) =>
      !finding.ruleId ||
      !policy.suppressions.some(
        (rule) => rule.ruleId === finding.ruleId && unmet.has(rule.whenExpectationUnmet),
      ),
  );
}

/**
 * Coverage model: the base is earned — 100 × met weight / total weight over
 * the prompt's applicable expectations (a dimension the prompt asks nothing
 * of stays at 100) — then rule violations subtract with geometric decay.
 */
function scoreCoverage(
  findings: readonly EngineFinding[],
  coverage: CoverageArtifact['entries'],
  policy: CoverageScoringPolicy,
): DimensionScores {
  const earned = {} as Record<EvalDimension, { met: number; total: number }>;
  for (const dimension of EVAL_DIMENSIONS) earned[dimension] = { met: 0, total: 0 };
  for (const entry of coverage) {
    earned[entry.dimension].total += entry.weight;
    if (entry.met) earned[entry.dimension].met += entry.weight;
  }

  const violations = {} as Record<EvalDimension, EngineFinding[]>;
  for (const dimension of EVAL_DIMENSIONS) violations[dimension] = [];
  for (const finding of findings) {
    if (finding.countsAsViolation) violations[finding.dimension].push(finding);
  }

  const scores = {} as DimensionScores;
  for (const dimension of EVAL_DIMENSIONS) {
    const { met, total } = earned[dimension];
    const base = total > 0 ? (100 * met) / total : 100;

    // Deterministic penalty order: worst first, then stable identity.
    const ordered = [...violations[dimension]].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        compareStrings(sortKey(a), sortKey(b)) ||
        compareStrings(a.affectedNodeIds.join(','), b.affectedNodeIds.join(',')),
    );
    let penalty = 0;
    ordered.forEach((finding, position) => {
      penalty += policy.violationPenalties[finding.severity] * policy.violationDecay ** position;
    });

    scores[dimension] = Math.round(Math.max(0, base - penalty) * 10) / 10;
  }
  return scores;
}

/**
 * A critical problem caps the letter no matter how the numbers average out —
 * an interviewer does not hand out an A over an unaddressed single point of
 * failure. Counts deterministic findings only; LLM output never reaches here.
 */
function applyGradeCaps(
  bandGrade: Grade,
  findings: readonly EngineFinding[],
  policy: CoverageScoringPolicy,
): { grade: Grade; capApplied: CapApplied | null } {
  let binding: CapApplied | null = null;
  for (const cap of policy.gradeCaps) {
    const count = findings.filter((finding) => finding.severity === cap.severity).length;
    if (count < cap.atLeast) continue;
    if (!binding || GRADE_ORDER[cap.maxGrade] < GRADE_ORDER[binding.maxGrade]) {
      binding = { severity: cap.severity, count, maxGrade: cap.maxGrade };
    }
  }
  if (!binding || GRADE_ORDER[bandGrade] <= GRADE_ORDER[binding.maxGrade]) {
    return { grade: bandGrade, capApplied: null };
  }
  return { grade: binding.maxGrade, capApplied: binding };
}

function weightedOverall(scores: DimensionScores, weights: Record<EvalDimension, number>): number {
  let total = 0;
  for (const dimension of EVAL_DIMENSIONS) {
    total += scores[dimension] * weights[dimension];
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
