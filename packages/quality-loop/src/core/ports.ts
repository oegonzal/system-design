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

import type { RunProgress, RunRecord, TaskContract } from './contracts';

export interface ProducerInput<T> {
  contract: TaskContract<T>;
  mode: ProduceMode;
  prior: T | null;
  remediations: RemediationNote[];
  /**
   * Why the latest revision was thrown out before any judge read it — the
   * validator notes of an iteration a validator blocked and that never
   * became best. `remediations` are the best iteration's and cannot say it.
   */
  refusals: RemediationNote[];
}

export interface Produced<T> {
  output: T | null;
  diagnostic: Diagnostic | null;
  model: string | null;
}

export interface Producer<T> {
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
 * What the terminal write found: `closed` a running row; `reclaimed` a row
 * the janitor had failed as Interrupted, now overwritten with the truth;
 * `refused` a row already terminal, which is never written again.
 */
export type CloseOutcome = 'closed' | 'reclaimed' | 'refused';

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
  /** Refresh the running row's heartbeat: the process is still here. */
  heartbeat(runId: string): Promise<void>;
  /**
   * The iterations a running loop has finished so far, with the rubric they
   * were judged against — a fresh snapshot each time, replacing the last, and
   * only while the row is still `running`. The header's verdict columns stay
   * empty until `close`.
   */
  recordProgress(runId: string, progress: RunProgress): Promise<void>;
  /**
   * The terminal write, in one transaction: the header, and — when the record
   * settled a trace — every child row, replacing any progress. A record that
   * ended without one (the loop threw) writes the header only: an iteration
   * once recorded is final, so the ones its progress wrote stand.
   */
  close(record: RunRecord): Promise<CloseOutcome>;
  /** The run as the wire carries it, its header and child rows read as one snapshot. */
  find(runId: string): Promise<QualityRunDto | null>;
  list(query: RunListQuery): Promise<[QualityRunSummaryDto[], number]>;
  /**
   * Fail every `running` row whose heartbeat is older than `before`; returns
   * how many. The header only: the iterations those runs recorded stand.
   */
  failStale(before: Date): Promise<number>;
}
