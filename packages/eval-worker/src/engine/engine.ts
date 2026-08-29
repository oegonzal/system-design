/**
 * The pure entry point: graph + prompt facts in, findings + scores + grade
 * out — no clock, no randomness, no I/O. Since the pass architecture landed
 * this is a synchronous façade over the deterministic slice of the active
 * profile: the rule sweep feeds the same aggregator the orchestrator uses,
 * so there is exactly one scoring implementation.
 */
import type { CanvasGraph } from '@sysdesign/contracts';

import { aggregate } from './core/aggregator';
import { buildGraphIndex } from './graph-index';
import { runExpectations } from './passes/expectations/expectations.pass';
import { RULES_PASS_ID, runRules } from './passes/rules/rules.pass';
import { DEFAULT_PROFILE } from './profiles/default.profile';
import type { EngineResult, PromptFacts } from './types';

export function runEngine(
  graph: CanvasGraph,
  facts: PromptFacts,
  narrative: string | null = null,
): EngineResult {
  const index = buildGraphIndex(graph);
  // The sync façade honors the same pass options the orchestrator would pass.
  const rulesOptions = DEFAULT_PROFILE.passes.find(
    (config) => config.pass === RULES_PASS_ID,
  )?.options;
  const rules = runRules({ graph, facts, index, narrative, options: rulesOptions });
  const [coverage, expectationFindings] = runExpectations({ graph, facts, index });
  const result = aggregate([rules, coverage, expectationFindings], DEFAULT_PROFILE);
  return {
    findings: result.findings,
    dimensionScores: result.dimensionScores,
    overallScore: result.overallScore,
    grade: result.grade,
    summary: result.summary,
  };
}
