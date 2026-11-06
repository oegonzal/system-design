/**
 * A critic lens: defect-oriented. "What is wrong, where, how severe, how sure,
 * how fixable?" — every answer enum-locked to this artifact's locations and
 * this contract's criteria. `samples` independent calls, each on its own
 * scoped client so the dump attributes every exchange.
 */
import type { CriticReport } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { TaskSpec } from '../contracts';
import type { CriticSpec } from '../pipeline';
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
} from './prompting';
import { enumTuple, findingsSchema } from './schemas';
import { planned, sampleUnits, skipped } from './shared';

export function createLlmCritic<T>(
  spec: CriticSpec,
  task: TaskSpec<T>,
  clients: readonly LlmClient[],
): Critic<T> {
  return {
    id: spec.id,
    plan(ctx: LensContext<T>) {
      // Only the types this lens owns: declared on the lens, else every one the task knows.
      const owned = Object.fromEntries(
        Object.entries(task.findingTypes).filter(
          ([type]) => spec.findingTypes === undefined || spec.findingTypes.includes(type),
        ),
      );
      const types = enumTuple(Object.keys(owned));
      if (!types) {
        return planned(skipped(spec.id, null, 'not-applicable', 'no finding types'));
      }

      const request = {
        system: systemPrompt('critic', spec.persona),
        user: joinSections(
          goalSection(ctx.contract.goal).text,
          criteriaSection(ctx.contract.criteria),
          typesSection(owned),
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
        effort: spec.effort,
      };

      return sampleUnits(spec.id, clients, request, (sample, response): CriticReport => ({
        criticId: spec.id,
        sample,
        findings: response.findings,
      }));
    },
  };
}
