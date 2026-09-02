/**
 * Wire types for the composable evaluation pipeline: which profile graded a
 * revision, the LLM-scored axes displayed beside the deterministic score, and
 * the adversarial scenario reports. The profile *instances* (weights, caps,
 * suppressions) live in the eval worker — engine behavior, not wire contract;
 * these types are what the API can render about a graded evaluation.
 */
import type { Grade, Severity } from './evaluations';

/** Ordinal factor levels — what the evidence implies, not a false-precision number. */
export const AXIS_FACTOR_LEVELS = ['none', 'low', 'medium', 'high'] as const;
export type AxisFactorLevel = (typeof AXIS_FACTOR_LEVELS)[number];

/**
 * One evaluator factor: an ordinal judgement with the rationale that earned
 * it. Factors ride beside the numeric subScores (which exist so meters can
 * render); the rationale is the part a person actually reads.
 */
export interface AxisFactor {
  id: string;
  label: string;
  level: AxisFactorLevel;
  rationale: string;
  /**
   * Which direction is good. "Remaining risk: high" is bad news and must
   * never wear the celebratory badge that "alignment: high" earns; the
   * display flips its tone scale for higher-is-worse factors. Defaults to
   * higher-is-better.
   */
  polarity?: 'higher-is-better' | 'higher-is-worse';
}

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
  /** Ordinal factor judgements with rationales; null on axes that score numerically. */
  factors: AxisFactor[] | null;
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
