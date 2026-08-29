/**
 * Evidence artifacts — the only currency between evaluation passes and the
 * aggregator. Every pass returns artifacts; the aggregator derives scores and
 * grade from them, and the full ordered list is the audit trail for "why this
 * grade". Pure types only: nothing here may import from passes, rules, or the
 * critic, which is what keeps the kernel's dependency arrow one-directional.
 */
import type { EvalDimension, Severity } from '@sysdesign/contracts';

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

/** Structurally identical to the critic's finding shape — kept import-free on purpose. */
export interface AnnotationFinding {
  dimension: EvalDimension;
  severity: Severity;
  title: string;
  message: string;
  affectedNodeIds: string[];
}

/** Free-form LLM commentary: persisted as source='llm' findings, advisory only. */
export interface AnnotationArtifact extends ArtifactBase {
  kind: 'annotations';
  findings: AnnotationFinding[];
  summary: string | null;
  model: string | null;
}

/** Why a pass produced nothing — skipped LLM, failed call, clipped prompt. */
export interface DiagnosticsArtifact extends ArtifactBase {
  kind: 'diagnostics';
  skipped: boolean;
  reason: 'llm-disabled' | 'llm-failed' | 'token-clipped' | null;
  detail: string | null;
}

export type EvidenceArtifact =
  | FindingsArtifact
  | CoverageArtifact
  | AxisArtifact
  | ScenarioArtifact
  | AnnotationArtifact
  | DiagnosticsArtifact;

export function isFindingsArtifact(artifact: EvidenceArtifact): artifact is FindingsArtifact {
  return artifact.kind === 'findings';
}

export function isCoverageArtifact(artifact: EvidenceArtifact): artifact is CoverageArtifact {
  return artifact.kind === 'coverage';
}
