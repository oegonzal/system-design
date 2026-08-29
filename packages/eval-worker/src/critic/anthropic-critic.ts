import type { LlmClient } from '@sysdesign/llm';

import { critiqueSchema } from './critique-schema';
import type { CriticInput, CritiqueResult, EvalCritic } from './eval-critic';
import { buildCriticUserPrompt, CRITIC_SYSTEM_PROMPT } from './prompt-builder';

const EMPTY: CritiqueResult = { findings: [], summary: null, model: null };

/**
 * The LLM half of the hybrid evaluator. Structured outputs already constrain
 * the shape; the clamp below is defense in depth — a finding pointing at a
 * node the canvas does not have would break click-to-highlight in the UI, so
 * unknown ids are dropped rather than trusted.
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
      schema: critiqueSchema,
      maxTokens: 8192,
    });

    if (!critique) return EMPTY;

    const knownNodeIds = new Set(input.graph.nodes.map((node) => node.id));

    return {
      summary: critique.summary.trim() || null,
      model: this.llm.model,
      findings: critique.findings.map((finding) => ({
        dimension: finding.dimension,
        severity: finding.severity,
        title: finding.title.trim(),
        message: finding.message.trim(),
        affectedNodeIds: finding.affectedNodeIds.filter((id) => knownNodeIds.has(id)),
      })),
    };
  }
}
