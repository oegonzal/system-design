/**
 * Builders the specs share. Pure helpers only — no vitest imports, so this
 * file compiles under the app tsconfig even though only specs use it. The
 * `tinyPipeline` is also the standing proof that the core assumes nothing
 * about system design.
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  CriticReport,
  DecisionPolicy,
  EvaluationReport,
  EvidenceLedger,
  LensOutcome,
  QualityControlDecision,
  QualityRunDto,
  RawCriterionResult,
  RawFinding,
  RunTrace,
  SuccessCriterion,
  UpstreamEvidence,
} from '@sysdesign/contracts';
import type { LlmCallSink, LlmClient, LlmRecordable, StructuredRequest } from '@sysdesign/llm';
import { z } from 'zod';

import type { RunRecord } from './contracts';
import { STANDARD } from './controllers';
import type { PipelineDefinition } from './pipeline';
import type { Critic, Evaluator, Producer } from './ports';

/**
 * A model that answers by SCHEMA: the first canned object that satisfies the
 * request's schema is the reply. Stage schemas are strict, so canned answers
 * for different stages never cross-match. Recordable, so attribution specs
 * see real exchanges.
 */
export function fakeLlm(...canned: readonly unknown[]): LlmClient & LlmRecordable {
  const build = (sink: LlmCallSink | null): LlmClient & LlmRecordable => ({
    enabled: true,
    model: 'test-model',
    async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
      const hit = canned
        .map((candidate) => request.schema.safeParse(candidate))
        .find((r) => r.success);
      const response = hit?.success ? hit.data : null;
      sink?.({
        model: 'test-model',
        system: request.system,
        user: request.user,
        schema: z.toJSONSchema(request.schema),
        maxTokens: request.maxTokens ?? 0,
        startedAt: '1970-01-01T00:00:00.000Z',
        durationMs: 0,
        outcome: response === null ? 'schema-miss' : 'ok',
        stopReason: null,
        usage: null,
        requestId: null,
        text: null,
        response,
        error: null,
      });
      return response;
    },
    withRecorder: (next) => build(next),
  });
  return build(null);
}

export const disabledLlm = (): LlmClient => ({
  enabled: false,
  model: null,
  completeStructured: () => Promise.resolve(null),
});

// ---- the tiny task ----------------------------------------------------------

export const tinyOutputSchema = z.strictObject({ text: z.string(), parts: z.array(z.string()) });
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

/** A settled criterion result, for controller specs. */
export const evidence = (overrides: Partial<CriterionEvidence> = {}): CriterionEvidence => ({
  criterionId: 'c1',
  kind: 'must',
  result: 'pass',
  hits: 1,
  confidence: 'high',
  locationRefs: ['text'],
  ...overrides,
});

/** A confirmed finding, for controller specs. */
export const confirmed = (overrides: Partial<ConfirmedFinding> = {}): ConfirmedFinding => ({
  key: 'gap|text',
  type: 'gap',
  severity: 'medium',
  confidence: 'high',
  fixability: 'fixable_local',
  locationRefs: ['text'],
  criterionIds: [],
  hits: 1,
  lenses: ['critic.tiny'],
  rationale: null,
  reconciledTo: null,
  ...overrides,
});

/** A ledger with sensible defaults, for controller specs. */
export const ledger = (overrides: Partial<EvidenceLedger> = {}): EvidenceLedger => ({
  artifactPresent: true,
  validation: [{ validatorId: 'schema', gate: 'block', problems: [] }],
  criteria: [],
  findings: [],
  discarded: [],
  diagnostics: [],
  ...overrides,
});

/** A decision with every gate open and the scores given, for specs that read runs rather than decide them. */
export const decision = (
  overrides: Partial<QualityControlDecision> = {},
): QualityControlDecision => ({
  finalDecision: 'accept',
  gates: {
    artifactPresent: true,
    validatorsPassed: true,
    evidenceSufficient: true,
    policyAllowed: true,
  },
  scores: { dimensions: {}, overall: 80 },
  selectedRemediations: [],
  reason: 'spec',
  trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: 80 },
  ...overrides,
});

/** A trace of `iterations` alike iterations around one decision and ledger, the last one crowned. */
export function traceOf<T = unknown>(
  overrides: {
    artifact?: T | null;
    decision?: QualityControlDecision;
    ledger?: EvidenceLedger;
    stopReason?: RunTrace['stopReason'];
    iterations?: number;
    goal?: string;
  } = {},
): RunTrace<T> {
  const judged = overrides.decision ?? decision();
  const count = overrides.iterations ?? 1;
  return {
    pipeline: { id: 'tiny', version: '0.0.1' },
    contract: { goal: overrides.goal ?? 'g', criteria: [] },
    iterations: Array.from({ length: count }, (_, index) => ({
      iteration: index + 1,
      mode: index === 0 ? 'initial' : 'revise',
      artifact: overrides.artifact ?? null,
      locations: [],
      rendered: null,
      validation: [],
      critics: [],
      evaluators: [],
      ledger: overrides.ledger ?? ledger(),
      decision: judged,
      remediations: [],
      durationMs: 0,
    })),
    bestIteration: count,
    finalDecision: judged.finalDecision,
    stopReason: overrides.stopReason ?? 'accepted',
    lessons: [],
  };
}

/** A finished run as the service reports it, around a trace; no trace means it failed. */
export const runDto = (
  runId: string,
  trace: RunTrace | null,
  overrides: Partial<QualityRunDto> = {},
): QualityRunDto => ({
  runId,
  pipeline: 'tiny',
  status: trace === null ? 'failed' : 'complete',
  startedAt: '2026-09-22T00:00:00.000Z',
  finishedAt: '2026-09-22T00:01:00.000Z',
  llm: { enabled: true, model: 'test-model', reason: null },
  request: {
    goal: trace?.contract.goal ?? 'g',
    outputProvided: false,
    criteriaProvided: false,
    maxIterations: 1,
  },
  trace,
  exchanges: [],
  error: trace === null ? { name: 'Boom', message: 'the model went away', stack: null } : null,
  ...overrides,
});

/** A finished run as `RunsService.execute` resolves it: the dto plus what the dump records. */
export const runRecord = (
  runId: string,
  trace: RunTrace | null,
  overrides: Partial<QualityRunDto> = {},
): RunRecord => ({
  ...runDto(runId, trace, overrides),
  exchanges: [],
  git: { branch: 'spec', headSha: 'spec' },
});
