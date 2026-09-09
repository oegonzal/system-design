/**
 * Definition + client + sink → stages. The schema validator is always first;
 * every LLM stage gets its own scoped client (one per sample for lenses), so
 * the dump can say which lens, which sample, which call.
 */
import type { LlmClient } from '@sysdesign/llm';

import type { LensSpec, PipelineDefinition } from './pipeline';
import type { ExchangeSink, Stages } from './ports';
import { scopeLlm } from './scoped-llm';
import { createCriteriaDeriver } from './stages/derive-criteria';
import { createLlmCritic } from './stages/llm-critic';
import { createLlmEvaluator } from './stages/llm-evaluator';
import { createLlmProducer } from './stages/llm-producer';
import { schemaValidator } from './stages/schema-validator';
import { CRITERIA_STAGE, PRODUCER_STAGE } from './stages/shared';

export const sampleScope = (lensId: string, sample: number): string => `${lensId}.s${sample}`;

export function materialize<T>(
  definition: PipelineDefinition<T>,
  llm: LlmClient,
  sink: ExchangeSink,
): Stages<T> {
  const scoped = (scope: string): LlmClient => scopeLlm(llm, scope, sink);

  const perSample = (lens: LensSpec): LlmClient[] =>
    Array.from({ length: lens.samples }, (_, index) => scoped(sampleScope(lens.id, index + 1)));

  return {
    deriveCriteria: createCriteriaDeriver(
      definition.task,
      definition.deriveCriteria,
      scoped(CRITERIA_STAGE),
    ),

    producer: createLlmProducer(definition.task, definition.producer, scoped(PRODUCER_STAGE)),

    validators: [schemaValidator<T>(), ...definition.validators],

    critics: definition.critics.map((spec) =>
      createLlmCritic(spec, definition.task, perSample(spec)),
    ),

    evaluators: definition.evaluators.map((spec) => createLlmEvaluator<T>(spec, perSample(spec))),

    controller: definition.controller,
  };
}
