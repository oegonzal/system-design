/**
 * Evidence artifacts — the only currency between evaluation passes and the
 * aggregator. Every pass returns artifacts; the aggregator derives scores and
 * grade from them, and the full ordered list is the audit trail for "why this
 * grade". Pure types only: nothing here may import from passes, rules, or the
 * critic, which is what keeps the kernel's dependency arrow one-directional.
 */
import type {
  AxisFactor,
  AxisFactorLevel,
  EvalDimension,
  GraphPatch,
  Severity,
} from '@sysdesign/contracts';

import type { EngineFinding } from '../types';

export type { EngineFinding } from '../types';

interface ArtifactBase {
  /** Which pass produced this — every artifact is attributable. */
  passId: string;
}

export interface FindingsArtifact extends ArtifactBase {
  kind: 'findings';
  findings: EngineFinding[];
}

/** The positive ledger: every applicable expectation, met or not, with proof. */
export interface CoverageArtifact extends ArtifactBase {
  kind: 'coverage';
  entries: Array<{
    expectationId: string;
    dimension: EvalDimension;
    weight: number;
    met: boolean;
    nfrId: string | null;
    evidenceNodeIds: string[];
    evidenceEdgeIds: string[];
  }>;
}

/**
 * An LLM-graded axis (e.g. depth & justification), displayed beside the
 * deterministic score. The aggregator's scoring path never reads it.
 */
export interface AxisArtifact extends ArtifactBase {
  kind: 'axis';
  axisId: string;
  label: string;
  score: number | null;
  subScores: Record<string, number> | null;
  /** Ordinal factor judgements with rationales; null on numeric-only axes. */
  factors: AxisFactor[] | null;
  summary: string | null;
  model: string | null;
}

export interface ScenarioArtifact extends ArtifactBase {
  kind: 'scenarios';
  reports: Array<{
    scenarioId: string;
    title: string;
    verdict: 'survives' | 'degrades' | 'fails';
    story: string;
    weakestNodeIds: string[];
  }>;
  model: string | null;
}

/**
 * One grounded weakness a critic/evaluator lens found, expressed as the ordinals
 * the engine scores — never a number the model picked. `level` is the weakness
 * MAGNITUDE (the uniform currency: a critic's issue and an evaluator's
 * requirement shortfall both express it here), `confidence` the lens's certainty
 * the weakness is real; the engine's generic scorer reads only those two ordinals
 * plus the profile's bounds. `severity` rides for display/persistence only.
 * `requirementId` grounds the weakness to a prompt requirement (an nfr id, a
 * workflow item id, or a synthetic `fr-<n>` ordinal) and `affectedNodeIds` to the
 * components — both re-checked admissible by the producer before emission, so the
 * ids the engine reads are always real.
 */
export interface GradedEvidenceItem {
  dimension: EvalDimension;
  /** Weakness magnitude; 'none' contributes nothing. */
  level: AxisFactorLevel;
  /** The lens's confidence the weakness is real. */
  confidence: AxisFactorLevel;
  severity: Severity;
  requirementId: string | null;
  affectedNodeIds: string[];
  rationale: string;
  suggestion: GraphPatch | null;
}

/**
 * A lens's grounded evidence set. It is neither `findings` nor `coverage`, so
 * `enforceMode` carries it through from an `mode:'llm'` pass untouched — and the
 * aggregator's generic scorer turns its ordinals into a BOUNDED, WEAKNESS-ONLY
 * per-dimension subtraction. That is the one way an LLM lens moves the
 * deterministic score: only downward, only off a dimension the deterministic
 * layer already assessed, only within the profile's per-dimension bound, and
 * never past a letter cap. The LLM still never authors a number and its
 * findings/coverage are still dropped. [EVAL-16]
 */
export interface GradedEvidenceArtifact extends ArtifactBase {
  kind: 'graded-evidence';
  /** The lens that produced it — 'critic', 'evaluator.workability', … */
  lens: string;
  items: GradedEvidenceItem[];
  summary: string | null;
  model: string | null;
}

/**
 * Why a pass produced nothing — skipped LLM, failed call, clipped prompt,
 * input the pass does not apply to — or why the orchestrator refused what it
 * produced (an LLM pass emitting scoring artifacts).
 */
export interface DiagnosticsArtifact extends ArtifactBase {
  kind: 'diagnostics';
  skipped: boolean;
  reason:
    | 'llm-disabled'
    | 'llm-failed'
    | 'token-clipped'
    | 'llm-artifact-rejected'
    | 'not-applicable'
    | null;
  detail: string | null;
}

export type EvidenceArtifact =
  | FindingsArtifact
  | CoverageArtifact
  | AxisArtifact
  | ScenarioArtifact
  | GradedEvidenceArtifact
  | DiagnosticsArtifact;

export function isFindingsArtifact(artifact: EvidenceArtifact): artifact is FindingsArtifact {
  return artifact.kind === 'findings';
}

export function isCoverageArtifact(artifact: EvidenceArtifact): artifact is CoverageArtifact {
  return artifact.kind === 'coverage';
}

export function isGradedEvidenceArtifact(
  artifact: EvidenceArtifact,
): artifact is GradedEvidenceArtifact {
  return artifact.kind === 'graded-evidence';
}
