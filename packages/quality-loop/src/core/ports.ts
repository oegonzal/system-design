/**
 * The ports the loop runs over. `materialize` builds the LLM-backed adapters
 * from a pipeline definition; specs hand in fakes. Nothing here knows about
 * Nest, the filesystem or a clock.
 */
import type { LlmExchange } from '@sysdesign/llm';

import type { PipelineSummary } from './pipeline';

import type {
  CriticReport,
  Criterion,
  Diagnostic,
  EvaluationReport,
  LensOutcome,
  Location,
  ProduceMode,
  RemediationNote,
  RunRecord,
  TaskContract,
  ValidationReport,
  ValidatorGate,
} from './contracts';

export interface ProducerInput<T> {
  contract: TaskContract<T>;
  mode: ProduceMode;
  prior: T | null;
  remediations: RemediationNote[];
}

export interface Produced<T> {
  output: T | null;
  diagnostic: Diagnostic | null;
  model: string | null;
}

export interface Producer<T> {
  /** False when no model backs it — the runner stops with `producer-unavailable`. */
  readonly enabled: boolean;
  produce(input: ProducerInput<T>): Promise<Produced<T>>;
}

export interface Validator<T> {
  readonly id: string;
  readonly gate: ValidatorGate;
  validate(artifact: T, contract: TaskContract<T>): ValidationReport;
}

export interface LensContext<T> {
  contract: TaskContract<T>;
  artifact: T;
  locations: Location[];
  /** `output.render(artifact)`, computed once per iteration. */
  rendered: string;
  validation: ValidationReport[];
}

/** One outcome per sample, in sample order. */
export interface Critic<T> {
  readonly id: string;
  run(ctx: LensContext<T>): Promise<LensOutcome<CriticReport>[]>;
}

export interface Evaluator<T> {
  readonly id: string;
  run(ctx: LensContext<T>): Promise<LensOutcome<EvaluationReport>[]>;
}

export type CriteriaDeriver = (
  goal: string,
) => Promise<{ criteria: Criterion[] | null; diagnostic: Diagnostic | null }>;

export interface Stages<T> {
  deriveCriteria: CriteriaDeriver;
  producer: Producer<T>;
  validators: readonly Validator<T>[];
  critics: readonly Critic<T>[];
  evaluators: readonly Evaluator<T>[];
}

export interface TraceStore {
  save(record: RunRecord, pipeline: PipelineSummary | null): void;
}

/** Where attributed model exchanges go — the dump collector, in production. */
export type ExchangeSink = (exchange: LlmExchange) => void;
