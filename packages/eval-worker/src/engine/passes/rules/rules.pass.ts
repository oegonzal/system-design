/**
 * The deterministic rule sweep as a pass. The synchronous core is exported
 * separately so `runEngine` (pure, sync) and the async orchestrator share one
 * implementation instead of two drifting ones.
 */
import { RULES } from '../../rules';
import type { EvalRule, PromptFacts, RuleContext } from '../../types';
import type { EngineFinding, FindingsArtifact } from '../../core/artifacts';
import type { EvalPass } from '../../core/types';
import type { GraphIndex } from '../../graph-index';
import type { CanvasGraph } from '@sysdesign/contracts';
import { applySeverityPolicy, readSeverityOverrides } from './severity-policy';

export const RULES_PASS_ID = 'rules.core';

export interface RulesInput {
  graph: CanvasGraph;
  facts: PromptFacts;
  index: GraphIndex;
  /** The design narrative submitted with the revision; omitted/null when absent. */
  narrative?: string | null;
  /** This pass's options from the active profile entry (severityOverrides). */
  options?: Record<string, unknown>;
}

export function runRules(input: RulesInput, rules: readonly EvalRule[] = RULES): FindingsArtifact {
  const ctx: RuleContext = {
    graph: input.graph,
    facts: input.facts,
    index: input.index,
    narrative: input.narrative ?? null,
  };
  const findings: EngineFinding[] = [];
  for (const rule of rules) {
    // The requirement this rule enforces, when the prompt names one.
    const nfrId = rule.nfrKind
      ? (input.facts.nfrs.find((nfr) => nfr.kind === rule.nfrKind)?.id ?? null)
      : null;
    for (const finding of rule.check(ctx)) {
      // Every rule finding is a violation: it subtracts from its dimension.
      findings.push({ ...finding, countsAsViolation: true, expectationId: null, nfrId });
    }
  }
  // Severity is re-graded last, so rules stay difficulty-blind on severity
  // and the profile owns how hard each lesson lands per tier.
  const overrides = readSeverityOverrides(input.options?.['severityOverrides']);
  return {
    passId: RULES_PASS_ID,
    kind: 'findings',
    findings: applySeverityPolicy(findings, input.facts.difficulty, overrides),
  };
}

export function createRulesPass(): EvalPass {
  return {
    id: RULES_PASS_ID,
    mode: 'deterministic',
    run: (ctx) => Promise.resolve([runRules(ctx)]),
  };
}
