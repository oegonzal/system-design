import type { Prompt } from '@sysdesign/db';

import type { PromptFacts } from '../../engine/types';

/**
 * The one projection from the stored prompt to what the engine reads. Shared
 * by the evaluation runner and the improvement runner so the two can never
 * grade against different views of the same prompt.
 */
export function promptFactsFrom(prompt: Prompt): PromptFacts {
  return {
    archetype: prompt.archetype,
    difficulty: prompt.difficulty,
    scaleTargets: prompt.scaleTargets,
    nfrKinds: [...new Set(prompt.nonFunctionalRequirements.map((nfr) => nfr.kind))],
    nfrs: prompt.nonFunctionalRequirements.map((nfr) => ({
      id: nfr.id,
      kind: nfr.kind,
      statement: nfr.statement,
      target: nfr.target ?? null,
      targetSpec: nfr.targetSpec ?? null,
    })),
    functionalCapabilities: prompt.functionalCapabilities,
    functionalRequirementCount: prompt.functionalRequirements.length,
    functionalText: prompt.functionalRequirements.join(' ').toLowerCase(),
    workflow: prompt.workflowSpec ?? null,
  };
}
