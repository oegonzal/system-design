import type { LlmClient } from '@sysdesign/llm';

import type { GradedEvidenceItem } from '../engine/core/artifacts';
import { admitGrounding, nodeIdSet, requirementIds } from '../engine/passes/graded-grounding';
import { buildCriticSchema } from './critique-schema';
import type { CriticInput, CritiqueResult, EvalCritic } from './eval-critic';
import { buildCriticUserPrompt, CRITIC_SYSTEM_PROMPT } from './prompt-builder';

const EMPTY: CritiqueResult = { items: [], summary: null, model: null };

/**
 * The LLM half of the hybrid evaluator, now a grounded weakness-finder: it
 * returns weaknesses as graded evidence (a magnitude + confidence tied to a
 * requirement and components), which the engine's bounded scorer turns into a
 * weakness-only subtraction. The schema is enum-locked to this prompt's
 * requirements and this canvas's nodes; the re-check below is defense in depth —
 * a requirement or node the model somehow named that does not exist is dropped
 * to null / filtered out rather than trusted (it would break click-to-highlight
 * and mis-ground the score).
 *
 * Never throws: an API failure, refusal or schema miss resolves to the empty
 * critique and the deterministic result stands alone.
 */
export class AnthropicCritic implements EvalCritic {
  constructor(private readonly llm: LlmClient) {}

  async review(input: CriticInput): Promise<CritiqueResult> {
    const critique = await this.llm.completeStructured({
      system: CRITIC_SYSTEM_PROMPT,
      user: buildCriticUserPrompt(input),
      schema: buildCriticSchema(input.graph, input.facts),
      maxTokens: 8192,
    });

    if (!critique) return EMPTY;

    const knownNodes = nodeIdSet(input.graph);
    const knownRequirements = new Set(requirementIds(input.facts));

    const items: GradedEvidenceItem[] = critique.findings.map((finding) => {
      const grounding = admitGrounding(
        finding.requirementId,
        finding.affectedComponents,
        knownRequirements,
        knownNodes,
      );
      return {
        dimension: finding.dimension,
        level: finding.weakness,
        confidence: finding.confidence,
        severity: finding.severity,
        requirementId: grounding.requirementId,
        affectedNodeIds: grounding.affectedNodeIds,
        rationale: `${finding.title.trim()} — ${finding.rationale.trim()}`,
        suggestion: null,
      };
    });

    return { items, summary: critique.summary.trim() || null, model: this.llm.model };
  }
}
