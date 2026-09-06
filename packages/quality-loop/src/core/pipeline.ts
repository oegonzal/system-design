/**
 * A pipeline is data: which kinds of criteria and findings exist, which lenses
 * look (each with an md persona), and the policy that turns their evidence into
 * a decision. The only code a pipeline brings is its `OutputShape` (how to
 * parse, address and render the artifact) and any deterministic validators.
 */
import { z } from 'zod';

import type { TaskSpec } from './contracts';
import type { Validator } from './ports';
import { validatePolicy, type DecisionPolicy } from './policy';

export interface LensSpec {
  id: string;
  /** The lens's expertise, as markdown text — imported with `?raw` beside the pipeline. */
  persona: string;
  /** Independent samples per iteration; agreement across them is what confirms an item. */
  samples: number;
  /** Cap on items per sample, in the response schema. */
  maxItems: number;
  maxTokens: number;
}

export interface EvaluatorSpec extends LensSpec {
  /** The criterion kinds this evaluator judges — each kind has exactly one judge. */
  criterionKinds: readonly string[];
}

export interface ProducerSpec {
  persona: string;
  maxTokens: number;
}

export interface PipelineDefinition<T> {
  id: string;
  version: string;
  description: string;
  task: TaskSpec<T>;
  deriveCriteria: ProducerSpec;
  producer: ProducerSpec;
  validators: readonly Validator<T>[];
  critics: readonly LensSpec[];
  evaluators: readonly EvaluatorSpec[];
  policy: DecisionPolicy;
}

/** Stage ids the engine owns; a lens may not take one. */
export const RESERVED_STAGE_IDS = ['producer', 'criteria', 'lenses'] as const;

export const describePipelineId = (definition: PipelineDefinition<unknown>): string =>
  `${definition.id}@${definition.version}`;

/** Fails fast on a malformed pipeline — before boot completes, never mid-run. */
export function validatePipeline(definition: PipelineDefinition<unknown>): void {
  const name = describePipelineId(definition);
  const fail = (message: string): never => {
    throw new Error(`pipeline ${name}: ${message}`);
  };

  validatePolicy(definition.policy, definition.task, name);

  const lenses = [...definition.critics, ...definition.evaluators];
  const ids = lenses.map((lens) => lens.id);
  if (new Set(ids).size !== ids.length) fail('lens ids must be unique');
  for (const id of ids) {
    if ((RESERVED_STAGE_IDS as readonly string[]).includes(id)) fail(`lens id ${id} is reserved`);
  }
  for (const lens of lenses) {
    if (!(lens.samples >= definition.policy.evidence.minHits)) {
      fail(
        `lens ${lens.id} runs ${lens.samples} sample(s) but minHits is ${definition.policy.evidence.minHits}`,
      );
    }
    if (!(lens.maxItems >= 1 && lens.maxTokens >= 1))
      fail(`lens ${lens.id} needs maxItems and maxTokens ≥ 1`);
    if (lens.persona.trim().length === 0) fail(`lens ${lens.id} has an empty persona`);
  }

  const judged = new Map<string, string>();
  for (const evaluator of definition.evaluators) {
    for (const kind of evaluator.criterionKinds) {
      if (!(kind in definition.task.criterionKinds))
        fail(`evaluator ${evaluator.id} judges unknown kind ${kind}`);
      const other = judged.get(kind);
      if (other) fail(`kind ${kind} is judged by both ${other} and ${evaluator.id}`);
      judged.set(kind, evaluator.id);
    }
  }
  for (const kind of Object.keys(definition.task.criterionKinds)) {
    if (!judged.has(kind)) fail(`kind ${kind} has no evaluator`);
  }

  const validatorIds = definition.validators.map((validator) => validator.id);
  if (new Set(validatorIds).size !== validatorIds.length) fail('validator ids must be unique');
  if (!(definition.task.maxCriteria >= 1)) fail('task.maxCriteria must be ≥ 1');

  // Both clients turn the output schema into JSON Schema; an unsupported zod
  // type would otherwise surface as a null response mid-run.
  z.toJSONSchema(definition.task.output.schema);
}

/** The serialisable projection: what `GET /pipelines` returns and the dump stores. */
export interface PipelineSummary {
  id: string;
  version: string;
  description: string;
  task: {
    criterionKinds: Record<string, string>;
    findingTypes: Record<string, string>;
    maxCriteria: number;
  };
  validators: { id: string; gate: string }[];
  critics: { id: string; samples: number; maxItems: number; maxTokens: number }[];
  evaluators: {
    id: string;
    samples: number;
    maxItems: number;
    maxTokens: number;
    criterionKinds: string[];
  }[];
  policy: DecisionPolicy;
}

export function describePipeline(definition: PipelineDefinition<unknown>): PipelineSummary {
  const { task } = definition;
  return {
    id: definition.id,
    version: definition.version,
    description: definition.description,
    task: {
      criterionKinds: { ...task.criterionKinds },
      findingTypes: { ...task.findingTypes },
      maxCriteria: task.maxCriteria,
    },
    validators: definition.validators.map(({ id, gate }) => ({ id, gate })),
    critics: definition.critics.map(({ id, samples, maxItems, maxTokens }) => ({
      id,
      samples,
      maxItems,
      maxTokens,
    })),
    evaluators: definition.evaluators.map(
      ({ id, samples, maxItems, maxTokens, criterionKinds }) => ({
        id,
        samples,
        maxItems,
        maxTokens,
        criterionKinds: [...criterionKinds],
      }),
    ),
    policy: definition.policy,
  };
}
