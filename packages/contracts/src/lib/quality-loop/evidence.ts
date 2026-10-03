import { bound, type Overrun, type SchemaIssue } from '../bounds';
import type {
  AxisFactorLevel,
  CriterionResult,
  Decision,
  DiagnosticReason,
  Fixability,
  Severity,
  ValidatorGate,
} from './vocab';

/** An addressable part of an artifact — the only thing a lens may point at. */
export interface ArtifactLocation {
  id: string;
  label: string;
}

/**
 * One success criterion — derived from the goal, or supplied with the run by
 * a caller that stored a rubric once and cites its ids across runs. The
 * limits are the persisted row's, so a supplied criterion is one the run can
 * record.
 */
export interface SuccessCriterion {
  id: string;
  kind: string;
  statement: string;
}
export const CRITERION_ID_MAX_LENGTH = 20;
export const CRITERION_KIND_MAX_LENGTH = 60;
/**
 * The bound a derived statement keeps unless its pipeline declares a larger
 * one (`TaskSpec.statementBound`): the target sits above the longest any
 * deriver but the experience digest's has measurably written (323
 * characters, a system-design one), and the ceiling is what a derivation is
 * accepted to without a word — a pipeline whose record genuinely needs
 * longer statements declares that where its deriver is declared, not here.
 * The stored column is `text`, so only a declared bound limits it.
 */
export const CRITERION_STATEMENT_BOUND = bound(400);
/**
 * The largest statement bound a pipeline may declare — the experience
 * digest's, sized from what its deriver measurably wrote. A rubric a pipeline
 * derives is handed back by whoever adopts an iteration it judged, so the
 * HTTP edge sizes its cap on a supplied statement from this bound
 * (`MAX_PROVIDED_STATEMENT_LENGTH`), and boot holds every pipeline's own bound
 * under that cap.
 */
export const LARGEST_STATEMENT_BOUND = bound(1200);

/** Position by position: the same ids, kinds and statements — what "the rubric it was judged against" means. */
export const sameRubric = (
  requested: readonly SuccessCriterion[],
  recorded: readonly SuccessCriterion[],
): boolean =>
  requested.length === recorded.length &&
  requested.every(
    (criterion, index) =>
      criterion.id === recorded[index].id &&
      criterion.kind === recorded[index].kind &&
      criterion.statement === recorded[index].statement,
  );

/**
 * What a diagnostic rests on, as data: the faults of the reply a stage was
 * refused — named, so the next ask can say what broke — or the one field a
 * reply wrote past the size it was asked for.
 */
export interface DiagnosticFacts {
  issues?: SchemaIssue[];
  overrun?: Overrun;
}

/** A stage that produced nothing, or noted what it did produce, and why. Never evidence; always traced. */
export interface Diagnostic {
  stage: string;
  sample: number | null;
  reason: DiagnosticReason;
  detail: string | null;
  /** Absent where it rests on nothing more than its reason, and on traces from before diagnostics carried any. */
  facts?: DiagnosticFacts;
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
  /** The first rationale a confirming lens gave — prose for a reader, never for the policy. */
  rationale: string | null;
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
