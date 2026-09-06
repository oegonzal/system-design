/**
 * The generator. It sees the goal, the criteria and — on a revise or retry —
 * the remediations the policy selected, in the lenses' own words. It never
 * sees a score: the producer improves against reasons, not against a number.
 */
import type { LlmClient } from '@sysdesign/llm';

import type { TaskSpec } from '../contracts';
import type { ProducerSpec } from '../pipeline';
import type { Producer } from '../ports';
import {
  criteriaSection,
  goalSection,
  joinSections,
  remediationsSection,
  systemPrompt,
} from '../prompting';
import { diagnostic, PRODUCER_STAGE } from './shared';

const INSTRUCTIONS = {
  initial: 'Produce the artifact for this goal, addressing every success criterion.',
  revise:
    'Return the WHOLE artifact again with every remediation applied and everything that was not criticised preserved.',
  retry: 'Start over from the goal. Avoid every listed pitfall.',
} as const;

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
          diagnostic: diagnostic(PRODUCER_STAGE, null, 'llm-disabled'),
          model: null,
        };
      }

      const goal = goalSection(contract.goal);
      const sections = [goal.text, criteriaSection(contract.criteria)];
      if (mode === 'revise' && prior !== null) {
        sections.push(
          ['# Your previous artifact', '', task.output.render(prior)].join('\n'),
          remediationsSection('Remediations to apply', remediations),
        );
      } else if (mode === 'retry') {
        sections.push(remediationsSection('Pitfalls of the discarded attempt', remediations));
      }
      sections.push(['# Instructions', '', INSTRUCTIONS[mode]].join('\n'));

      const output = await llm.completeStructured({
        system: systemPrompt('producer', spec.persona),
        user: joinSections(...sections),
        schema: task.output.schema,
        maxTokens: spec.maxTokens,
      });

      if (output === null) {
        return {
          output: null,
          diagnostic: diagnostic(PRODUCER_STAGE, null, 'llm-failed'),
          model: llm.model,
        };
      }

      return {
        output,
        diagnostic: goal.clipped
          ? diagnostic(PRODUCER_STAGE, null, 'token-clipped', 'goal exceeded the prompt budget')
          : null,
        model: llm.model,
      };
    },
  };
}
