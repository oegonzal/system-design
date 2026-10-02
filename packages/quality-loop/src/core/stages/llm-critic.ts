/**
 * A critic lens: defect-oriented. "What is wrong, where, how severe, how sure,
 * how fixable?" — every answer enum-locked to this artifact's locations and
 * this contract's criteria. `samples` independent calls, each on its own
 * scoped client so the dump attributes every exchange.
 */
import type { CriticReport } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { TaskSpec } from '../contracts';
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
  upstreamSections,
  validationSection,
} from './prompting';
import { enumTuple, findingsSchema } from './schemas';
import { planned, sampleUnits, skipped } from './shared';

export function createLlmCritic<T>(
  spec: LensSpec,
  task: TaskSpec<T>,
  clients: readonly LlmClient[],
): Critic<T> {
  return {
    id: spec.id,
    consumes: spec.consumes,
    plan(ctx: LensContext<T>) {
      const types = enumTuple(Object.keys(task.findingTypes));
      if (!types) {
        return planned(skipped(spec.id, null, 'not-applicable', 'no finding types'));
      }

      const request = {
        system: systemPrompt('critic', spec.persona),
        user: joinSections(
          goalSection(ctx.contract.goal).text,
          criteriaSection(ctx.contract.criteria),
          typesSection(task.findingTypes),
          artifactSection(ctx.rendered),
          locationsSection(ctx.locations),
          validationSection(ctx.validation),
          ...upstreamSections(ctx.upstream, spec.consumes),
        ),
        schema: findingsSchema(
          types,
          ctx.contract.criteria.map((criterion) => criterion.id),
          ctx.locations.map((location) => location.id),
          spec.maxItems,
        ),
        maxTokens: spec.maxTokens,
      };

      return sampleUnits(spec.id, clients, request, (sample, response): CriticReport => ({
        criticId: spec.id,
        sample,
        findings: response.findings,
      }));
    },
  };
}
