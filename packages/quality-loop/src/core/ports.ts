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
  Overrun,
  PipelineSummary,
  ProduceMode,
  QualityControlDecision,
  QualityRunDto,
  QualityRunSummaryDto,
  RemediationNote,
  SchemaIssue,
  SuccessCriterion,
  UpstreamEvidence,
  ValidationReport,
  ValidatorGate,
} from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';

import type { RunProgress, RunRecord, TaskContract } from './contracts';

/**
 * A lesson a run was handed before it started, for its producer alone. The
 * engine neither knows nor asks where it came from — a memory store, a
 * person — and never interprets it: it is shown verbatim, under its own
 * advisory heading, to a producer that declared it consumes `memories`, and
 * to no other stage. It is not part of the contract, so no criterion, finding
 * or score can rest on it.
 */
export interface AdvisoryMemory {
  /** How the host names it, so a reader of the prompt can trace it back. */
  ref: string;
  text: string;
}

export interface ProducerInput<T> {
  contract: TaskContract<T>;
  mode: ProduceMode;
  prior: T | null;
  remediations: RemediationNote[];
  /**
   * Why the latest attempt was thrown out before any judge read it — the
   * validator notes of an iteration a validator blocked and that never
   * became best, or, when the last produce answered nothing, the faults the
   * schema refused its reply for (subject `schema`). `remediations` are the
   * best iteration's and cannot say either.
   */
  refusals: RemediationNote[];
  /** The run's advisory memories, the same on every call; empty when it was handed none. */
  memories: readonly AdvisoryMemory[];
}

export interface Produced<T> {
  output: T | null;
  diagnostic: Diagnostic | null;
  model: string | null;
  /** On a null output: every fault of the last reply the schema refused; empty when nothing parsed, or beside an output. */
  issues: SchemaIssue[];
  /** Beside an output: every field the reply wrote past the size it was asked for, as the seam handled it. */
  overruns: Overrun[];
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

/**
 * One sample's work: the call it makes, and the outcome it becomes. Never
 * throws — the model client answers null rather than rejecting.
 */
export type LensUnit<R> = () => Promise<LensOutcome<R>>;

/**
 * A lens says what its samples are; the loop decides how many run at once.
 *
 * `plan` is synchronous on purpose: every prompt in a wave is built before any
 * call is issued, so a malformed lens is a failure at the start of the wave
 * rather than halfway through it. And a lens cannot schedule itself, so the
 * pipeline's declared concurrency is a bound the loop enforces rather than
 * one each lens has to remember to respect.
 *
 * One unit per sample, in sample order — the number a sample is planned with
 * is the number it reports, because agreement is counted across a lens's own
 * samples and a sample that renumbered itself would be counted as another.
 */
export interface Critic<T> {
  readonly id: string;
  /** Declared upstream evidence; the runner schedules the lens after it exists. */
  readonly consumes: readonly UpstreamEvidence[];
  plan(ctx: LensContext<T>): readonly LensUnit<CriticReport>[];
}

export interface Evaluator<T> {
  readonly id: string;
  readonly consumes: readonly UpstreamEvidence[];
  plan(ctx: LensContext<T>): readonly LensUnit<EvaluationReport>[];
}

export interface DerivedCriteria {
  criteria: SuccessCriterion[] | null;
  /** Why it derived nothing, or derived from a clipped goal; null when it answered whole. */
  diagnostic: Diagnostic | null;
  /** Every statement the reply wrote past the length it was asked for — kept, and recorded by the loop. */
  overruns: Overrun[];
}

export type CriteriaDeriver = (goal: string) => Promise<DerivedCriteria>;

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
