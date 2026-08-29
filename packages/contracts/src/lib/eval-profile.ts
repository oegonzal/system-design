/**
 * Wire types for the composable evaluation pipeline: which profile graded a
 * revision, the LLM-scored axes displayed beside the deterministic score, and
 * the adversarial scenario reports. The profile *instances* (weights, caps,
 * suppressions) live in the eval worker — engine behavior, not wire contract;
 * these types are what the API can render about a graded evaluation.
 */
import type { Grade, Severity } from './evaluations';

/**
 * An LLM-graded axis (e.g. depth & justification). Advisory by construction:
 * the aggregator's scoring path never reads axes, so `score` can disagree
 * with the deterministic grade and that disagreement is the display.
 */
export interface EvalAxisDto {
  id: string;
  label: string;
  /** 0–100, or null when the LLM was disabled or failed. */
  score: number | null;
  subScores: Record<string, number> | null;
  summary: string | null;
  model: string | null;
}

export const SCENARIO_VERDICTS = ['survives', 'degrades', 'fails'] as const;
export type ScenarioVerdict = (typeof SCENARIO_VERDICTS)[number];

/** One adversarial what-if, narrated: how the design behaves when it happens. */
export interface ScenarioReportDto {
  scenarioId: string;
  title: string;
  verdict: ScenarioVerdict;
  story: string;
  weakestNodeIds: string[];
}

/** Why a grade shows a lower letter than its numeric band alone would give. */
export interface CapAppliedDto {
  severity: Severity;
  count: number;
  maxGrade: Grade;
}
