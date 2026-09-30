/**
 * The tiny pipeline and its scripted stages. The `tinyPipeline` is the
 * standing proof that the core assumes nothing about system design.
 */
import type {
  CriticReport,
  DecisionPolicy,
  EvaluationReport,
  LensOutcome,
  RawCriterionResult,
  RawFinding,
  SuccessCriterion,
  UpstreamEvidence,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { STANDARD } from '../controllers';
import type { PipelineDefinition } from '../pipeline';
import type { Critic, Evaluator, Producer, Stages } from '../ports';

// ---- the tiny task ----------------------------------------------------------

const tinyOutputSchema = z.strictObject({ text: z.string(), parts: z.array(z.string()) });
export type TinyOutput = z.infer<typeof tinyOutputSchema>;

export const tinyPolicy = (): DecisionPolicy => ({
  version: 'test',
  dimensionWeights: { substance: 0.6, form: 0.4 },
  criterionKinds: {
    must: { dimension: 'substance', weight: 1, gate: false },
    nice: { dimension: 'form', weight: 1, gate: false },
  },
  findingTypes: {
    gap: { dimension: 'substance', gate: false },
    wrong: { dimension: 'form', gate: false },
  },
  resultValues: { pass: 1, partial: 0.5, fail: 0 },
  confidenceWeights: { none: 0, low: 0.33, medium: 0.67, high: 1 },
  penalties: {
    bySeverity: { critical: 40, high: 25, medium: 12, low: 5, info: 0 },
    decay: 0.7,
    maxPerDimension: 60,
  },
  blockingSeverities: ['critical'],
  evidence: { minHits: 1, minAssessedShare: 0.75 },
  thresholds: { acceptAt: 80, rejectBelow: 35 },
  loop: { maxIterations: 3, plateauAfter: 2, concurrency: 2 },
});

export function tinyPipeline(
  overrides: Partial<PipelineDefinition<TinyOutput>> = {},
): PipelineDefinition<TinyOutput> {
  return {
    id: 'tiny',
    version: '0.0.1',
    description: 'A two-field artifact for specs.',
    task: {
      criterionKinds: {
        must: 'Something the goal requires.',
        nice: 'Something the goal would like.',
      },
      findingTypes: { gap: 'Something required is missing.', wrong: 'Something stated is wrong.' },
      maxCriteria: 6,
      output: {
        schema: tinyOutputSchema,
        locate: (output) => [
          { id: 'text', label: 'Text' },
          ...output.parts.map((part, index) => ({ id: `part.${index + 1}`, label: part })),
        ],
        render: (output) =>
          [
            `[text] ${output.text}`,
            ...output.parts.map((part, index) => `[part.${index + 1}] ${part}`),
          ].join('\n'),
      },
    },
    deriveCriteria: { persona: 'You extract requirements.', maxTokens: 500 },
    producer: { persona: 'You write two-field artifacts.', maxTokens: 500, consumes: ['criteria'] },
    validators: [],
    controller: STANDARD,
    critics: [
      {
        id: 'critic.tiny',
        persona: 'You find gaps.',
        samples: 1,
        maxItems: 4,
        maxTokens: 500,
        consumes: [],
      },
    ],
    evaluators: [
      {
        id: 'evaluator.tiny',
        persona: 'You judge criteria.',
        samples: 1,
        maxItems: 8,
        maxTokens: 500,
        criterionKinds: ['must', 'nice'],
        consumes: [],
      },
    ],
    policy: tinyPolicy(),
    ...overrides,
  };
}

export const criterion = (
  id: string,
  kind = 'must',
  statement = `criterion ${id}`,
): SuccessCriterion => ({
  id,
  kind,
  statement,
});

export const finding = (overrides: Partial<RawFinding> = {}): RawFinding => ({
  type: 'gap',
  severity: 'medium',
  confidence: 'high',
  fixability: 'fixable_local',
  locationRefs: ['text'],
  criterionIds: [],
  rationale: 'something is missing',
  ...overrides,
});

export const result = (overrides: Partial<RawCriterionResult> = {}): RawCriterionResult => ({
  criterionId: 'c1',
  result: 'pass',
  confidence: 'high',
  locationRefs: ['text'],
  rationale: 'it is there',
  ...overrides,
});

export const reported = <R>(report: R): LensOutcome<R> => ({ report, diagnostic: null });

// ---- scripted stages ---------------------------------------------------------

export const scriptedProducer = (outputs: readonly (TinyOutput | null)[]): Producer<TinyOutput> => {
  let call = 0;
  return {
    enabled: true,
    produce: () => {
      const output = outputs[Math.min(call++, outputs.length - 1)] ?? null;
      return Promise.resolve({
        output,
        diagnostic:
          output === null
            ? { stage: 'producer', sample: null, reason: 'llm-failed', detail: null }
            : null,
        model: 'scripted',
      });
    },
  };
};

/** One report per sample per iteration: `perIteration[i][sample]`. */
export const scriptedCritic = (
  id: string,
  perIteration: readonly (readonly RawFinding[][])[],
  consumes: readonly UpstreamEvidence[] = [],
): Critic<TinyOutput> => {
  let call = 0;
  return {
    id,
    consumes,
    run: () => {
      const samples = perIteration[Math.min(call++, perIteration.length - 1)] ?? [];
      return Promise.resolve(
        samples.map((findings, index) =>
          reported<CriticReport>({ criticId: id, sample: index + 1, findings: [...findings] }),
        ),
      );
    },
  };
};

export const scriptedEvaluator = (
  id: string,
  perIteration: readonly (readonly RawCriterionResult[][])[],
  advisoryVerdict: EvaluationReport['advisoryVerdict'] = null,
  consumes: readonly UpstreamEvidence[] = [],
): Evaluator<TinyOutput> => {
  let call = 0;
  return {
    id,
    consumes,
    run: () => {
      const samples = perIteration[Math.min(call++, perIteration.length - 1)] ?? [];
      return Promise.resolve(
        samples.map((results, index) =>
          reported<EvaluationReport>({
            evaluatorId: id,
            sample: index + 1,
            results: [...results],
            advisoryVerdict,
          }),
        ),
      );
    },
  };
};

// ---- a whole loop, scripted ----------------------------------------------------

/** The tiny task's two drafts, in the order the scripted producer returns them. */
export const DRAFT_1: TinyOutput = { text: 'first', parts: ['a'] };
export const DRAFT_2: TinyOutput = { text: 'second', parts: ['a', 'b'] };

/** A deriver that answers with the given criteria, or — given null — as a model that is off. */
export const scriptedDeriver =
  (criteria: SuccessCriterion[] | null): Stages<TinyOutput>['deriveCriteria'] =>
  () =>
    Promise.resolve({
      criteria,
      diagnostic: criteria
        ? null
        : { stage: 'criteria', sample: null, reason: 'llm-disabled' as const, detail: null },
    });

/** The tiny task's schema, as a blocking validator the loop runs first. */
const tinySchemaValidator = (): Stages<TinyOutput>['validators'][number] => ({
  id: 'schema',
  gate: 'block',
  validate: (artifact, contract) => ({
    validatorId: 'schema',
    gate: 'block',
    problems: contract.output.schema.safeParse(artifact).success
      ? []
      : [{ severity: 'critical', locationRefs: [], message: 'not the shape' }],
  }),
});

/**
 * A full set of scripted stages for the tiny task: two criteria, two drafts,
 * a critic that finds one gap and then none, an evaluator that improves on
 * the second draft. Override what a spec is about.
 */
export function scriptedStages(overrides: Partial<Stages<TinyOutput>> = {}): Stages<TinyOutput> {
  return {
    deriveCriteria: scriptedDeriver([criterion('c1'), criterion('c2', 'nice')]),
    producer: scriptedProducer([DRAFT_1, DRAFT_2]),
    validators: [tinySchemaValidator()],
    critics: [scriptedCritic('critic.tiny', [[[finding({ criterionIds: ['c1'] })]], [[]]])],
    evaluators: [
      scriptedEvaluator('evaluator.tiny', [
        [[result({ criterionId: 'c1', result: 'partial' }), result({ criterionId: 'c2' })]],
        [[result({ criterionId: 'c1' }), result({ criterionId: 'c2' })]],
      ]),
    ],
    controller: STANDARD,
    ...overrides,
  };
}
