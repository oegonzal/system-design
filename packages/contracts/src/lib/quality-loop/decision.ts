import type { AxisFactorLevel, Severity } from './vocab';
import type {
  ArtifactLocation,
  CriticReport,
  EvaluationReport,
  EvidenceLedger,
  EvidenceResult,
  LensOutcome,
  SuccessCriterion,
  ValidationReport,
} from './evidence';
import type { Decision, IterationMode, StopReason } from './vocab';

/**
 * What the producer is asked to act on. Chosen by the policy from the ledger
 * — except `schema`, a path of a reply the schema refused before any judge
 * read it, which the runner names from the refusal itself.
 */
export interface Remediation {
  subject: { finding: string } | { criterion: string } | { validator: string } | { schema: string };
  action: 'revise' | 'retry';
  severity: Severity;
  targetRefs: string[];
}

/** A remediation with the lens's own words attached — hydrated by the runner, never by the policy. */
export interface RemediationNote extends Remediation {
  note: string;
}

export interface Gates {
  artifactPresent: boolean;
  validatorsPassed: boolean;
  evidenceSufficient: boolean;
  policyAllowed: boolean;
}

export interface PenaltyTrace {
  key: string;
  /** 0-based; the multiplier applied was `decay ** position`. */
  position: number;
  severity: Severity;
  confidence: AxisFactorLevel;
  listPoints: number;
  decayed: number;
  /** What it actually subtracted after the per-dimension clamp. */
  points: number;
}

export interface CriterionTrace {
  criterionId: string;
  kind: string;
  weight: number;
  result: EvidenceResult;
  value: number | null;
}

export interface DimensionTrace {
  dimension: string;
  weight: number | null;
  criteria: CriterionTrace[];
  base: number | null;
  penalties: PenaltyTrace[];
  penaltyTotal: number;
  clampScale: number;
  score: number | null;
}

/**
 * What a decision step decided on, as data: the numbers it compared and the
 * ids it named. Open, like the factor that records it — each gate says what
 * its own decision rests on — so a reader words a decision from these rather
 * than from `detail`, the controller's sentence for its trace.
 */
export type DecisionFacts = Readonly<Record<string, number | string | boolean | readonly string[]>>;

/**
 * One consulted factor of a decision. `factor` is open, like criterion kinds
 * and finding types: a controller is composed of gates, and a pipeline may
 * compose one from gates of its own. `scores` is the one reserved factor —
 * the engine records it before any gate is consulted.
 */
export interface DecisionStep {
  order: number;
  factor: string;
  outcome: 'computed' | 'passed' | 'decided' | 'skipped';
  detail: string;
  /** What the step decided on; absent where it recorded none, and on traces from before steps carried any. */
  facts?: DecisionFacts;
}

export interface DecisionTrace {
  steps: DecisionStep[];
  dimensions: DimensionTrace[];
  weightSum: number;
  weightedTotal: number;
}

/**
 * What closed the engine's gates, by the id its record keys it with: the
 * validators whose problems refuse, the confirmed findings that block, the
 * gating criteria that failed. The engine's facts, like `gates` — recorded
 * under every controller, so a reader that routes on them (the browser
 * session cutting a plan at the first blocked action) reads the decision's
 * own account and never re-derives one from the policy.
 */
export interface Blocking {
  validators: string[];
  findings: string[];
  criteria: string[];
}

export interface QualityControlDecision {
  finalDecision: Decision;
  gates: Gates;
  blocking: Blocking;
  scores: { dimensions: Record<string, number | null>; overall: number };
  selectedRemediations: Remediation[];
  reason: string;
  trace: DecisionTrace;
}

export interface IterationTrace<T = unknown> {
  iteration: number;
  mode: IterationMode;
  artifact: T | null;
  locations: ArtifactLocation[];
  /** The text every judge read — `OutputShape.render(artifact)`; null when there was no artifact. */
  rendered: string | null;
  validation: ValidationReport[];
  critics: LensOutcome<CriticReport>[];
  evaluators: LensOutcome<EvaluationReport>[];
  ledger: EvidenceLedger;
  decision: QualityControlDecision;
  remediations: RemediationNote[];
  durationMs: number;
}

export interface Lesson {
  kind: 'persisted' | 'resolved' | 'improved' | 'regressed';
  subject: string;
  iterations: number[];
  detail: string;
}

export interface RunTrace<T = unknown> {
  pipeline: { id: string; version: string };
  contract: { goal: string; criteria: readonly SuccessCriterion[] };
  iterations: IterationTrace<T>[];
  bestIteration: number;
  finalDecision: Decision;
  /**
   * Why the loop ended; null while it still runs, and on a run that failed
   * before it chose to stop — the trace then holds the iterations finished
   * so far, `bestIteration` and `finalDecision` are its standing after the
   * last of them, and the lessons are theirs.
   */
  stopReason: StopReason | null;
  lessons: Lesson[];
}
