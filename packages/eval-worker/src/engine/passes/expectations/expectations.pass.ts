/**
 * The coverage pass: evaluate every expectation the prompt makes applicable,
 * ledger the result (met or not — the positive audit trail), and emit an
 * unmet expectation as a teaching finding with a ghost fix when one exists.
 * Synchronous core shared with `runEngine`, async wrapper for the profile.
 */
import { briefHasClaims, type CanvasGraph, type DesignBrief } from '@sysdesign/contracts';

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
  narrative?: string | null;
  brief?: DesignBrief | null;
}

export function runExpectations(
  input: ExpectationsInput,
  expectations: readonly Expectation[] = EXPECTATIONS,
): [CoverageArtifact, FindingsArtifact] {
  // Two scopes, one invariant: diagram expectations get `brief: null`
  // mechanically, so the author's claims about a design can never add or
  // remove a demand on the diagram that the prompt itself did not make.
  // Brief-scoped expectations (`requiresBrief`) grade the claims, and only
  // they may read them. Most have nothing to grade when no brief was
  // submitted and are skipped; the one that asks whether a brief exists at
  // all opts out of that skip (`appliesWithoutBrief`), so a submission with
  // no brief scores explanation 0 rather than dropping out of the rubric.
  //
  // Neither context sees the walkthrough. Prose is read by the LLM critic and
  // by nothing that scores.
  const brief = input.brief ?? null;
  const diagramCtx: RuleContext = {
    graph: input.graph,
    facts: input.facts,
    index: input.index,
    narrative: null,
    brief: null,
  };
  const briefCtx: RuleContext = { ...diagramCtx, brief };
  const entries: CoverageArtifact['entries'] = [];
  const findings: EngineFinding[] = [];

  for (const expectation of expectations) {
    if (expectation.requiresBrief && !briefHasClaims(brief) && !expectation.appliesWithoutBrief) {
      continue;
    }
    if (!expectationApplies(expectation, input.facts)) continue;
    const ctx = expectation.requiresBrief ? briefCtx : diagramCtx;
    const check = expectation.satisfiedBy(ctx);
    // The requirement this expectation enforces, when the prompt names one.
    const nfrKind = expectation.nfrKind ?? expectation.citesNfrKind;
    const nfrId = nfrKind
      ? (input.facts.nfrs.find((nfr) => nfr.kind === nfrKind)?.id ?? null)
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
      // A check that saw the actual gap words it better than the prompt-only lesson.
      message: check.unmetDetail ?? expectation.teach(input.facts),
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
