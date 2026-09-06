/**
 * A critic lens: defect-oriented. "What is wrong, where, how severe, how sure,
 * how fixable?" — every answer enum-locked to this artifact's locations and
 * this contract's criteria. `samples` independent calls, each on its own
 * scoped client so the dump attributes every exchange.
 */
import type { LlmClient } from '@sysdesign/llm';

import type { CriticReport, LensOutcome, TaskSpec } from '../contracts';
import type { LensSpec } from '../pipeline';
import type { Critic, LensContext } from '../ports';
import {
  artifactSection,
  criteriaSection,
  goalSection,
  joinSections,
  locationsSection,
  systemPrompt,
  typesSection,
  validationSection,
} from '../prompting';
import { enumTuple, findingsSchema } from '../schemas';
import { skipped } from './shared';

export function createLlmCritic<T>(
  spec: LensSpec,
  task: TaskSpec<T>,
  clients: readonly LlmClient[],
): Critic<T> {
  return {
    id: spec.id,
    async run(ctx: LensContext<T>) {
      const types = enumTuple(Object.keys(task.findingTypes));
      if (!types) return [skipped(spec.id, null, 'not-applicable', 'no finding types')];

      const request = {
        system: systemPrompt('critic', spec.persona),
        user: joinSections(
          goalSection(ctx.contract.goal).text,
          criteriaSection(ctx.contract.criteria),
          typesSection(task.findingTypes),
          artifactSection(ctx.rendered),
          locationsSection(ctx.locations),
          validationSection(ctx.validation),
        ),
        schema: findingsSchema(
          types,
          ctx.contract.criteria.map((criterion) => criterion.id),
          ctx.locations.map((location) => location.id),
          spec.maxItems,
        ),
        maxTokens: spec.maxTokens,
      };

      const outcomes: LensOutcome<CriticReport>[] = [];
      for (const [index, llm] of clients.entries()) {
        const sample = index + 1;
        if (!llm.enabled) {
          outcomes.push(skipped(spec.id, sample, 'llm-disabled'));
          continue;
        }
        const response = await llm.completeStructured(request);
        outcomes.push(
          response === null
            ? skipped(spec.id, sample, 'llm-failed')
            : {
                report: { criticId: spec.id, sample, findings: response.findings },
                diagnostic: null,
              },
        );
      }
      return outcomes;
    },
  };
}
