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

/** What the producer is asked to act on. Chosen by the policy from the ledger. */
export interface Remediation {
  subject: { finding: string } | { criterion: string } | { validator: string };
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
}

export interface DecisionTrace {
  steps: DecisionStep[];
  dimensions: DimensionTrace[];
  weightSum: number;
  weightedTotal: number;
}

export interface QualityControlDecision {
  finalDecision: Decision;
  gates: Gates;
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
  stopReason: StopReason;
  lessons: Lesson[];
}
