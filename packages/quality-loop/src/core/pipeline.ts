/**
 * A pipeline is data: which kinds of criteria and findings exist, which lenses
 * look (each with an md persona), and the policy that turns their evidence into
 * a decision. The only code a pipeline brings is its `OutputShape` (how to
 * parse, address and render the artifact) and any deterministic validators.
 */
import type {
  DecisionPolicy,
  PipelineSummary,
  ProducerBriefing,
  UpstreamEvidence,
} from '@sysdesign/contracts';
import { PRODUCER_BRIEFING, UPSTREAM_EVIDENCE } from '@sysdesign/contracts';
import { z } from 'zod';

import type { TaskSpec } from './contracts';
import { validatePolicy } from './policy';
import type { Validator } from './ports';

export interface LensSpec {
  id: string;
  /** The lens's expertise, as markdown text — imported with `?raw` beside the pipeline. */
  persona: string;
  /** Independent samples per iteration; agreement across them is what confirms an item. */
  samples: number;
  /** Cap on items per sample, in the response schema. */
  maxItems: number;
  maxTokens: number;
  /**
   * Upstream ledger evidence this lens judges with. Empty: it runs in the
   * first wave from the artifact alone. Non-empty: it runs after that wave and
   * is shown what the normaliser CONFIRMED from it — never a raw report. The
   * declaration drives both when the lens runs and what it is shown.
   */
  consumes: readonly UpstreamEvidence[];
}

export interface EvaluatorSpec extends LensSpec {
  /** The criterion kinds this evaluator judges — each kind has exactly one judge. */
  criterionKinds: readonly string[];
}

export interface StageSpec {
  persona: string;
  maxTokens: number;
}

export interface ProducerSpec extends StageSpec {
  /**
   * What the first draft is briefed with beyond the goal. Empty withholds the
   * derived criteria, so the artifact must meet the brief rather than echo the
   * checklist it will be graded against. Remediations on revise and retry are
   * unaffected: feedback is not the answer key.
   */
  consumes: readonly ProducerBriefing[];
}

export interface PipelineDefinition<T> {
  id: string;
  version: string;
  description: string;
  task: TaskSpec<T>;
  deriveCriteria: StageSpec;
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

  // A declared dependency on evidence nobody produces is a malformed pipeline:
  // the first wave must contain a lens of the kind that produces it.
  const firstWaveCritics = definition.critics.filter((lens) => lens.consumes.length === 0);
  const firstWaveEvaluators = definition.evaluators.filter((lens) => lens.consumes.length === 0);
  for (const lens of lenses) {
    for (const evidence of lens.consumes) {
      if (!(UPSTREAM_EVIDENCE as readonly string[]).includes(evidence))
        fail(`lens ${lens.id} consumes unknown evidence ${evidence}`);
    }
    if (lens.consumes.includes('findings') && firstWaveCritics.length === 0)
      fail(`lens ${lens.id} consumes findings but no critic runs before it`);

    if (lens.consumes.includes('results') && firstWaveEvaluators.length === 0)
      fail(`lens ${lens.id} consumes results but no evaluator runs before it`);
  }
  for (const briefing of definition.producer.consumes) {
    if (!(PRODUCER_BRIEFING as readonly string[]).includes(briefing))
      fail(`producer consumes unknown briefing ${briefing}`);
  }

  const validatorIds = definition.validators.map((validator) => validator.id);
  if (new Set(validatorIds).size !== validatorIds.length) fail('validator ids must be unique');
  if (!(definition.task.maxCriteria >= 1)) fail('task.maxCriteria must be ≥ 1');

  // Both clients turn the output schema into JSON Schema; an unsupported zod
  // type would otherwise surface as a null response mid-run.
  z.toJSONSchema(definition.task.output.schema);
}

/** The serialisable projection: what `GET /pipelines` returns and the dump stores. */
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
    producer: { consumes: [...definition.producer.consumes] },
    validators: definition.validators.map(({ id, gate }) => ({ id, gate })),
    critics: definition.critics.map(({ id, samples, maxItems, maxTokens, consumes }) => ({
      id,
      samples,
      maxItems,
      maxTokens,
      consumes: [...consumes],
    })),
    evaluators: definition.evaluators.map(
      ({ id, samples, maxItems, maxTokens, criterionKinds, consumes }) => ({
        id,
        samples,
        maxItems,
        maxTokens,
        criterionKinds: [...criterionKinds],
        consumes: [...consumes],
      }),
    ),
    policy: definition.policy,
  };
}
