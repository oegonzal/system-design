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
  SchemaIssue,
  SuccessCriterion,
  UpstreamEvidence,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { readArtifact } from '../contracts';
import { STANDARD } from '../controllers';
import type { PipelineDefinition } from '../pipeline';
import { STANDARD_SCORING } from '../policy';
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
  ...STANDARD_SCORING,
  evidence: { minHits: 1, minAssessedShare: 0.75, lostSample: 'score-only' },
  thresholds: { acceptAt: 80, rejectBelow: 35 },
  loop: { maxIterations: 3, plateauAfter: 2, concurrency: 2, lostProduces: 1 },
});

export function tinyPipeline(
  overrides: Partial<PipelineDefinition<TinyOutput>> = {},
): PipelineDefinition<TinyOutput> {
  return {
    id: 'tiny',
    version: '0.0.1',
    description: 'A two-field artifact for specs.',
    goalSource: 'brief',
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

/**
 * The drafts in order, the last standing for every later call. A null is a
 * produce that answered nothing — refused for `refused`, the faults a seam
 * would have named, when given.
 */
export const scriptedProducer = (
  outputs: readonly (TinyOutput | null)[],
  refused: readonly SchemaIssue[] = [],
): Producer<TinyOutput> => {
  let call = 0;
  return {
    produce: () => {
      const output = outputs[Math.min(call++, outputs.length - 1)] ?? null;
      return Promise.resolve({
        output,
        diagnostic:
          output === null
            ? {
                stage: 'producer',
                sample: null,
                reason: 'llm-failed',
                detail: null,
                ...(refused.length > 0 ? { facts: { issues: [...refused] } } : {}),
              }
            : null,
        model: 'scripted',
        issues: output === null ? [...refused] : [],
        overruns: [],
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
    // Planned once per iteration, exactly as the real lens is, so a spec that
    // counts lens calls still counts iterations.
    plan: () => {
      const samples = perIteration[Math.min(call++, perIteration.length - 1)] ?? [];
      return samples.map(
        (findings, index) => () =>
          Promise.resolve(
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
    plan: () => {
      const samples = perIteration[Math.min(call++, perIteration.length - 1)] ?? [];
      return samples.map(
        (results, index) => () =>
          Promise.resolve(
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

/** Every sample of one lens, run together — what a spec wants when it is testing the lens, not the schedule. */
export const runLens = <R>(
  lens: { plan: (ctx: never) => readonly (() => Promise<R>)[] },
  ctx: unknown,
): Promise<R[]> => Promise.all(lens.plan(ctx as never).map((unit) => unit()));

// ---- a whole loop, scripted ----------------------------------------------------

/** The tiny task's two drafts, in the order the scripted producer returns them. */
export const DRAFT_1: TinyOutput = { text: 'first', parts: ['a'] };
export const DRAFT_2: TinyOutput = { text: 'second', parts: ['a', 'b'] };

/** A deriver that answers with the given criteria, or — given null — as a model that failed. */
export const scriptedDeriver =
  (criteria: SuccessCriterion[] | null): Stages<TinyOutput>['deriveCriteria'] =>
  () =>
    Promise.resolve({
      criteria,
      diagnostic: criteria
        ? null
        : { stage: 'criteria', sample: null, reason: 'llm-failed' as const, detail: null },
      overruns: [],
    });

/** The tiny task's schema, as a blocking validator the loop runs first, read as the engine reads an artifact. */
const tinySchemaValidator = (): Stages<TinyOutput>['validators'][number] => ({
  id: 'schema',
  gate: 'block',
  validate: (artifact, contract) => ({
    validatorId: 'schema',
    gate: 'block',
    problems: readArtifact(contract.output.schema, artifact).ok
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
