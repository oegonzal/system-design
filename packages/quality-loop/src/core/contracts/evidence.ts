import type {
  AxisFactorLevel,
  CriterionResult,
  Decision,
  DiagnosticReason,
  Fixability,
  Severity,
  ValidatorGate,
} from './vocab';

/** A stage that produced nothing, and why. Never evidence; always traced. */
export interface Diagnostic {
  stage: string;
  sample: number | null;
  reason: DiagnosticReason;
  detail: string | null;
}

export interface ValidationProblem {
  severity: Severity;
  locationRefs: string[];
  message: string;
}

export interface ValidationReport {
  validatorId: string;
  gate: ValidatorGate;
  problems: ValidationProblem[];
}

// ---- what the lenses say (prose allowed; never handed to the policy) -------

export interface RawFinding {
  type: string;
  severity: Severity;
  confidence: AxisFactorLevel;
  fixability: Fixability;
  locationRefs: string[];
  criterionIds: string[];
  rationale: string;
}

export interface CriticReport {
  criticId: string;
  sample: number;
  findings: RawFinding[];
}

export interface RawCriterionResult {
  criterionId: string;
  result: CriterionResult;
  confidence: AxisFactorLevel;
  locationRefs: string[];
  rationale: string;
}

export interface EvaluationReport {
  evaluatorId: string;
  sample: number;
  results: RawCriterionResult[];
  /** Recorded in the trace only: the ledger has no field for it, so the policy cannot read it. */
  advisoryVerdict: Decision | null;
}

export type LensOutcome<R> =
  { report: R; diagnostic: null } | { report: null; diagnostic: Diagnostic };

// ---- the normalized ledger: ids, enums and counts. The ONLY input to `decide`.

export type EvidenceResult = CriterionResult | 'unassessed';

export interface CriterionEvidence {
  criterionId: string;
  kind: string;
  result: EvidenceResult;
  /** Samples that judged it; below the policy's minHits it is `unassessed`. */
  hits: number;
  confidence: AxisFactorLevel | null;
  locationRefs: string[];
}

export interface ConfirmedFinding {
  /** `${type}|${sorted locationRefs}` — structural, wording-independent. */
  key: string;
  type: string;
  severity: Severity;
  confidence: AxisFactorLevel;
  fixability: Fixability;
  locationRefs: string[];
  criterionIds: string[];
  hits: number;
  lenses: string[];
  /** A failed or partial criterion already charging this lesson; a reconciled finding is never priced. */
  reconciledTo: string | null;
}

export interface DiscardedItem {
  lens: string;
  key: string;
  reason: 'below-min-hits' | 'inadmissible';
  detail: string;
}

export interface EvidenceLedger {
  artifactPresent: boolean;
  validation: ValidationReport[];
  criteria: CriterionEvidence[];
  findings: ConfirmedFinding[];
  discarded: DiscardedItem[];
  diagnostics: Diagnostic[];
}
