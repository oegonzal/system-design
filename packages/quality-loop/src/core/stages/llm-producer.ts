/**
 * The generator. It sees the goal, the criteria and — on a revise or retry —
 * the remediations the policy selected, in the lenses' own words. It never
 * sees a score: the producer improves against reasons, not against a number.
 */
import type { ProduceMode, RemediationNote } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { TaskContract, TaskSpec } from '../contracts';
import type { ProducerSpec } from '../pipeline';
import type { Producer } from '../ports';
import {
  criteriaSection,
  goalSection,
  joinSections,
  remediationsSection,
  systemPrompt,
} from './prompting';
import { PRODUCER_STAGE, stageDiagnostic } from './shared';

const INSTRUCTIONS = {
  initial: 'Produce the artifact for this goal, addressing every success criterion.',
  revise:
    'Return the WHOLE artifact again with every remediation applied and everything that was not criticised preserved.',
  retry: 'Start over from the goal. Avoid every listed pitfall.',
} as const;

/**
 * What the producer is briefed with: the goal, the criteria if it consumes
 * them, on a revise its previous artifact and what to fix, on a retry what to
 * avoid, and the instruction for the mode.
 */
function briefing<T>(
  task: TaskSpec<T>,
  spec: ProducerSpec,
  contract: TaskContract<T>,
  mode: ProduceMode,
  prior: T | null,
  remediations: readonly RemediationNote[],
): { sections: string[]; clipped: boolean } {
  const goal = goalSection(contract.goal);
  const sections = [goal.text];
  if (spec.consumes.includes('criteria')) sections.push(criteriaSection(contract.criteria));
  if (mode === 'revise' && prior !== null) {
    sections.push(
      ['# Your previous artifact', '', task.output.render(prior)].join('\n'),
      remediationsSection('Remediations to apply', remediations),
    );
  } else if (mode === 'retry') {
    sections.push(remediationsSection('Pitfalls of the discarded attempt', remediations));
  }
  sections.push(['# Instructions', '', INSTRUCTIONS[mode]].join('\n'));
  return { sections, clipped: goal.clipped };
}

export function createLlmProducer<T>(
  task: TaskSpec<T>,
  spec: ProducerSpec,
  llm: LlmClient,
): Producer<T> {
  return {
    enabled: llm.enabled,
    async produce({ contract, mode, prior, remediations }) {
      if (!llm.enabled) {
        return {
          output: null,
          diagnostic: stageDiagnostic(PRODUCER_STAGE, 'llm-disabled'),
          model: null,
        };
      }

      const briefed = briefing(task, spec, contract, mode, prior, remediations);
      const output = await llm.completeStructured({
        system: systemPrompt('producer', spec.persona),
        user: joinSections(...briefed.sections),
        schema: task.output.schema,
        maxTokens: spec.maxTokens,
      });

      if (output === null) {
        return {
          output: null,
          diagnostic: stageDiagnostic(PRODUCER_STAGE, 'llm-failed'),
          model: llm.model,
        };
      }

      return {
        output,
        diagnostic: briefed.clipped
          ? stageDiagnostic(PRODUCER_STAGE, 'token-clipped', 'goal exceeded the prompt budget')
          : null,
        model: llm.model,
      };
    },
  };
}
