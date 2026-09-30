/**
 * The ports the loop runs over. `materialize` builds the LLM-backed adapters
 * from a pipeline definition; specs hand in fakes. Nothing here knows about
 * Nest, the filesystem or a clock.
 */
import type {
  ArtifactLocation,
  ConfirmedFinding,
  ControllerSummary,
  CriterionEvidence,
  CriticReport,
  DecisionPolicy,
  Diagnostic,
  EvaluationReport,
  EvidenceLedger,
  LensOutcome,
  ListQualityRunsQuery,
  LlmExchangeSummaryDto,
  PipelineSummary,
  ProduceMode,
  QualityControlDecision,
  QualityRunDto,
  QualityRunSummaryDto,
  RemediationNote,
  SuccessCriterion,
  UpstreamEvidence,
  ValidationReport,
  ValidatorGate,
} from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';

import type { RunRecord, TaskContract } from './contracts';

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

/**
 * What the normaliser confirmed from the wave before. A lens receives only the
 * kinds it declared it consumes; a first-wave lens receives it empty.
 */
export interface UpstreamEvidenceBundle {
  findings: ConfirmedFinding[];
  results: CriterionEvidence[];
}

export const emptyUpstream = (): UpstreamEvidenceBundle => ({ findings: [], results: [] });

export interface LensContext<T> {
  contract: TaskContract<T>;
  artifact: T;
  locations: ArtifactLocation[];
  /** `output.render(artifact)`, computed once per iteration. */
  rendered: string;
  validation: ValidationReport[];
  upstream: UpstreamEvidenceBundle;
}

/** One outcome per sample, in sample order. */
export interface Critic<T> {
  readonly id: string;
  /** Declared upstream evidence; the runner schedules the lens after it exists. */
  readonly consumes: readonly UpstreamEvidence[];
  run(ctx: LensContext<T>): Promise<LensOutcome<CriticReport>[]>;
}

export interface Evaluator<T> {
  readonly id: string;
  readonly consumes: readonly UpstreamEvidence[];
  run(ctx: LensContext<T>): Promise<LensOutcome<EvaluationReport>[]>;
}

export type CriteriaDeriver = (
  goal: string,
) => Promise<{ criteria: SuccessCriterion[] | null; diagnostic: Diagnostic | null }>;

/**
 * The controller: the ledger and the policy in, a decision out. Synchronous
 * by contract — no model, clock or I/O can be awaited here, which is how the
 * doctrine's "the controller stays deterministic" is held by the type rather
 * than by review. A pipeline declares one the way it declares validators;
 * `core/controllers` composes them from gates.
 */
export interface Controller {
  readonly id: string;
  /** What the controller consults, in order — projected into the pipeline summary. */
  readonly summary: ControllerSummary;
  decide(ledger: EvidenceLedger, policy: DecisionPolicy): QualityControlDecision;
}

export interface Stages<T> {
  deriveCriteria: CriteriaDeriver;
  producer: Producer<T>;
  validators: readonly Validator<T>[];
  critics: readonly Critic<T>[];
  evaluators: readonly Evaluator<T>[];
  controller: Controller;
}

export interface TraceStore {
  save(record: RunRecord, pipeline: PipelineSummary | null): void;
}

/** Where attributed model exchanges go — the dump collector, in production. */
export type ExchangeSink = (exchange: LlmExchange) => void;

/** The list query after the HTTP edge applied its defaults. */
export type RunListQuery = ListQualityRunsQuery & { limit: number; offset: number };

/**
 * Where runs live between requests and across restarts — Postgres, in
 * production. The dump (`TraceStore`) stays the full audit trail; this is the
 * record of truth the HTTP surface answers from.
 */
export interface RunRepository {
  /** Insert the running header before the loop starts; `GET /runs/:id` answers from here on. */
  open(record: RunRecord, pipelineVersion: string): Promise<void>;
  /** The live exchange log — a fresh snapshot each time, in the caller's order. */
  recordExchange(runId: string, exchanges: LlmExchangeSummaryDto[]): Promise<void>;
  /** The terminal write: the header plus every child row, in one transaction. */
  close(record: RunRecord): Promise<void>;
  find(runId: string): Promise<QualityRunDto | null>;
  list(query: RunListQuery): Promise<[QualityRunSummaryDto[], number]>;
  /** Rows still `running` from a previous process are failed; returns how many. */
  failInterrupted(): Promise<number>;
}
