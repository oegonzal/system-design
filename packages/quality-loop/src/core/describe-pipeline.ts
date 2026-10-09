/**
 * The serialisable projection of a pipeline declaration: what `GET /pipelines`
 * returns, what the dump stores as `03-pipeline.json`, and what the
 * orchestrators and the inspector read about a pipeline without its code.
 */
import type { PipelineSummary } from '@sysdesign/contracts';

import { projectStep } from './controllers/compose';
import { providedStatementLimit } from './contracts';
import type { CriticSpec, EvaluatorSpec, PipelineDefinition } from './pipeline';

/** A critic consumes nothing — it judges the artifact alone — and the summary says so in the lens shape every lens shares. */
const summariseCritic = ({ id, samples, maxItems, maxTokens, findingTypes }: CriticSpec) => ({
  id,
  samples,
  maxItems,
  maxTokens,
  consumes: [],
  ...(findingTypes === undefined ? {} : { findingTypes: [...findingTypes] }),
});

/**
 * Key order is the summary's wire order: what it judges comes before what it
 * consumes. An evaluator answers one result per criterion of its kinds, so the
 * most it returns is the task's own cap.
 */
const summariseEvaluator =
  (maxCriteria: number) =>
  ({ id, samples, maxTokens, criterionKinds, consumes }: EvaluatorSpec) => ({
    id,
    samples,
    maxItems: maxCriteria,
    maxTokens,
    criterionKinds: [...criterionKinds],
    consumes: [...consumes],
  });

/** The serialisable projection: what `GET /pipelines` returns and the dump stores. */
export function describePipeline(definition: PipelineDefinition<unknown>): PipelineSummary {
  const { task } = definition;
  return {
    id: definition.id,
    version: definition.version,
    description: definition.description,
    goalSource: definition.goalSource,
    task: {
      criterionKinds: { ...task.criterionKinds },
      findingTypes: { ...task.findingTypes },
      maxCriteria: task.maxCriteria,
      maxStatementLength: providedStatementLimit(task),
    },
    producer: { consumes: [...definition.producer.consumes] },
    validators: definition.validators.map(({ id, gate }) => ({ id, gate })),
    critics: definition.critics.map(summariseCritic),
    evaluators: definition.evaluators.map(summariseEvaluator(task.maxCriteria)),
    controller: {
      id: definition.controller.summary.id,
      steps: definition.controller.summary.steps.map(projectStep),
    },
    policy: definition.policy,
  };
}
