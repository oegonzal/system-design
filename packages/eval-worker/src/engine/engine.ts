/**
 * The one entry point: graph + prompt facts in, findings + scores + grade out.
 * Pure and deterministic — no clock, no randomness, no I/O — so the same
 * revision always evaluates to byte-identical output.
 */
import {
  EVAL_DIMENSIONS,
  type CanvasGraph,
  type EvalDimension,
  type Severity,
} from '@sysdesign/contracts';

import { buildGraphIndex } from './graph-index';
import { RULES } from './rules';
import { gradeFor, overallScore, scoreDimensions } from './scoring';
import type { EngineResult, PromptFacts, RuleFinding } from './types';

export { ENGINE_VERSION } from './scoring';

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function runEngine(graph: CanvasGraph, facts: PromptFacts): EngineResult {
  const index = buildGraphIndex(graph);
  const ctx = { graph, facts, index };
  const findings: RuleFinding[] = [];
  for (const rule of RULES) {
    findings.push(...rule.check(ctx));
  }
  findings.sort(
    (a, b) =>
      compareStrings(a.ruleId, b.ruleId) ||
      compareStrings(a.affectedNodeIds.join(','), b.affectedNodeIds.join(',')),
  );

  const dimensionScores = scoreDimensions(findings);
  const overall = overallScore(dimensionScores);
  const grade = gradeFor(overall);

  return {
    findings,
    dimensionScores,
    overallScore: overall,
    grade,
    summary: composeSummary(findings, dimensionScores, overall, grade),
  };
}

function composeSummary(
  findings: readonly RuleFinding[],
  scores: EngineResult['dimensionScores'],
  overall: number,
  grade: EngineResult['grade'],
): string {
  // Info findings are footnotes, not problems — the summary leads with what hurts.
  const actionable = findings
    .filter((finding) => finding.severity !== 'info')
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || compareStrings(a.ruleId, b.ruleId),
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
