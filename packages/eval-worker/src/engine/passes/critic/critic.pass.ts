/**
 * The free-form LLM critic as a pass: commentary the deterministic engine
 * cannot produce, emitted as an annotation artifact the aggregator carries
 * through without ever scoring.
 */
import { AnthropicCritic } from '../../../critic/anthropic-critic';
import { isFindingsArtifact } from '../../core/artifacts';
import type { EvalPass } from '../../core/types';

export const CRITIC_PASS_ID = 'llm.critic';

export function createCriticPass(): EvalPass {
  return {
    id: CRITIC_PASS_ID,
    mode: 'llm',
    run: async (ctx) => {
      if (!ctx.llm.enabled) {
        return [
          {
            passId: CRITIC_PASS_ID,
            kind: 'diagnostics',
            skipped: true,
            reason: 'llm-disabled',
            detail: null,
          },
        ];
      }

      const deterministicFindings = ctx.priorArtifacts
        .filter(isFindingsArtifact)
        .flatMap((artifact) => artifact.findings);

      // AnthropicCritic never throws — any model failure resolves to an empty critique.
      const critique = await new AnthropicCritic(ctx.llm).review({
        graph: ctx.graph,
        facts: ctx.facts,
        narrative: ctx.narrative,
        deterministicFindings,
      });

      return [
        {
          passId: CRITIC_PASS_ID,
          kind: 'annotations',
          findings: critique.findings,
          summary: critique.summary,
          model: critique.model,
        },
      ];
    },
  };
}
