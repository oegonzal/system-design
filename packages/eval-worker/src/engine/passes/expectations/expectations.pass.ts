/**
 * The coverage pass: evaluate every expectation the prompt makes applicable,
 * ledger the result (met or not — the positive audit trail), and emit an
 * unmet expectation as a teaching finding with a ghost fix when one exists.
 * Synchronous core shared with `runEngine`, async wrapper for the profile.
 */
import type { CanvasGraph } from '@sysdesign/contracts';

import type { CoverageArtifact, EvidenceArtifact, FindingsArtifact } from '../../core/artifacts';
import type { EvalPass } from '../../core/types';
import type { GraphIndex } from '../../graph-index';
import type { EngineFinding, PromptFacts, RuleContext } from '../../types';
import { EXPECTATIONS } from './banks';
import { expectationApplies, type Expectation } from './types';

export const EXPECTATIONS_PASS_ID = 'expectations.banks';

export interface ExpectationsInput {
  graph: CanvasGraph;
  facts: PromptFacts;
  index: GraphIndex;
}

export function runExpectations(
  input: ExpectationsInput,
  expectations: readonly Expectation[] = EXPECTATIONS,
): [CoverageArtifact, FindingsArtifact] {
  const ctx: RuleContext = { graph: input.graph, facts: input.facts, index: input.index };
  const entries: CoverageArtifact['entries'] = [];
  const findings: EngineFinding[] = [];

  for (const expectation of expectations) {
    if (!expectationApplies(expectation, input.facts)) continue;
    const check = expectation.satisfiedBy(ctx);
    // The requirement this expectation enforces, when the prompt names one.
    const nfrId = expectation.nfrKind
      ? (input.facts.nfrs.find((nfr) => nfr.kind === expectation.nfrKind)?.id ?? null)
      : null;
    entries.push({
      expectationId: expectation.id,
      dimension: expectation.dimension,
      weight: expectation.weight,
      met: check.met,
      nfrId,
      evidenceNodeIds: check.evidenceNodeIds,
      evidenceEdgeIds: check.evidenceEdgeIds,
    });
    if (check.met) continue;
    findings.push({
      ruleId: null,
      expectationId: expectation.id,
      nfrId,
      dimension: expectation.dimension,
      severity: expectation.severityIfUnmet,
      title: expectation.title,
      message: expectation.teach(input.facts),
      affectedNodeIds: check.evidenceNodeIds,
      affectedEdgeIds: check.evidenceEdgeIds,
      suggestion: expectation.suggest?.(ctx) ?? null,
      // The unmet expectation already reduced the coverage base — findings
      // report and teach it, they do not subtract a second time.
      countsAsViolation: false,
    });
  }

  return [
    { passId: EXPECTATIONS_PASS_ID, kind: 'coverage', entries },
    { passId: EXPECTATIONS_PASS_ID, kind: 'findings', findings },
  ];
}

export function createExpectationsPass(): EvalPass {
  return {
    id: EXPECTATIONS_PASS_ID,
    mode: 'deterministic',
    run: (ctx) => Promise.resolve<EvidenceArtifact[]>(runExpectations(ctx)),
  };
}
