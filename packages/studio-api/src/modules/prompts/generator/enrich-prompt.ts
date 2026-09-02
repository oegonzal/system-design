import type { LlmClient } from '@sysdesign/llm';
import { z } from 'zod';

import type { GeneratedPrompt, GeneratorExperience } from './prompt-generator';

/**
 * Optional LLM polish over the deterministic generator's output.
 *
 * Scope is deliberately narrow: the model may rewrite the scenario *prose*
 * and append at most two extra functional requirements. It never touches
 * scale targets, NFRs or the workflow spec — those are scoring inputs the
 * eval engine reads, and they stay byte-deterministic. On any failure (no
 * key, refusal, schema miss) the generated prompt stands unchanged with
 * `llmEnriched: false`. `EnrichedFields` has no workflowSpec key, so the
 * polish is structurally unable to reshape the graded surface.
 */
const enrichmentSchema = z.object({
  scenario: z
    .string()
    .min(200)
    .max(4000)
    .describe('The rewritten scenario. Keep every number and constraint from the original.'),
  extraFunctionalRequirements: z
    .array(z.string().max(200))
    .max(2)
    .describe('Up to two additional, distinct functional requirements. Empty if none add value.'),
});

const SYSTEM_PROMPT = [
  'You are a senior engineer writing system-design interview prompts. Rewrite',
  'the scenario below into sharper, more engaging second-person prose. Keep',
  'every concrete number (users, req/s, latency, availability) exactly as',
  'given, keep the same domain, and do not contradict any listed requirement.',
].join(' ');

export interface EnrichedFields {
  scenario: string;
  functionalRequirements: string[];
  llmEnriched: boolean;
}

export async function enrichPrompt(
  llm: LlmClient,
  generated: GeneratedPrompt,
  experience: GeneratorExperience,
): Promise<EnrichedFields> {
  const passThrough: EnrichedFields = {
    scenario: generated.scenario,
    functionalRequirements: generated.functionalRequirements,
    llmEnriched: false,
  };

  if (!llm.enabled) return passThrough;

  const result = await llm.completeStructured({
    system: SYSTEM_PROMPT,
    user: [
      `# Domain background`,
      `${experience.title} (${experience.archetype})`,
      ...experience.highlights.map((h) => `- ${h}`),
      ``,
      `# Scenario to rewrite`,
      generated.scenario,
      ``,
      `# Existing functional requirements (do not repeat)`,
      ...generated.functionalRequirements.map((fr) => `- ${fr}`),
    ].join('\n'),
    schema: enrichmentSchema,
    maxTokens: 2048,
  });

  if (!result) return passThrough;

  return {
    scenario: result.scenario,
    functionalRequirements: [
      ...generated.functionalRequirements,
      ...result.extraFunctionalRequirements,
    ],
    llmEnriched: true,
  };
}
