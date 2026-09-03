/**
 * The LLM critic as a pass: a grounded weakness-finder. It reports what the
 * deterministic engine cannot see — misplaced responsibilities, consistency
 * traps, operational blind spots — as graded evidence (each weakness a magnitude
 * + confidence tied to a prompt requirement and components). The artifact is
 * neither findings nor coverage, so `enforceMode` carries it through; the
 * engine's generic scorer turns it into a bounded, weakness-only subtraction.
 * The LLM still never authors a number.
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
          kind: 'graded-evidence',
          lens: 'critic',
          items: critique.items,
          summary: critique.summary,
          model: critique.model,
        },
      ];
    },
  };
}
