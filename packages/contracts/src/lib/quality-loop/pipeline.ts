import type { ApiResponse } from '../envelope';
import type { AxisFactorLevel } from '../eval-profile';
import type { Severity } from '../evaluations';

/**
 * The decision policy: every number, threshold, gate and route the controller
 * uses. A pipeline declares one as data; the loop refuses a malformed one
 * before it can grade anything.
 */
export interface DecisionPolicy {
  version: string;
  /** Dimensions ARE the keys; weights sum to 1. */
  dimensionWeights: Readonly<Record<string, number>>;
  /** Every task criterion kind: where its credit lands, how much it weighs, whether a fail blocks. */
  criterionKinds: Readonly<Record<string, { dimension: string; weight: number; gate: boolean }>>;
  /** Every task finding type: where its penalty lands, whether it is an unacceptable failure mode. */
  findingTypes: Readonly<Record<string, { dimension: string; gate: boolean }>>;
  resultValues: Readonly<Record<'pass' | 'partial' | 'fail', number>>;
  confidenceWeights: Readonly<Record<AxisFactorLevel, number>>;
  penalties: {
    bySeverity: Readonly<Record<Severity, number>>;
    /** Multiplier on each successive finding within a dimension, in (0, 1]. */
    decay: number;
    maxPerDimension: number;
  };
  blockingSeverities: readonly Severity[];
  evidence: {
    /** Samples an item must recur in to count. */
    minHits: number;
    /** Share of criteria that must be assessed before a score means anything. */
    minAssessedShare: number;
  };
  thresholds: { acceptAt: number; rejectBelow: number };
  loop: { maxIterations: number; plateauAfter: number; concurrency: number };
}

/** A gate's declared parameters, as data — the numbers a trace's details are measured against. */
export type ControllerParams = Readonly<Record<string, number | string | boolean>>;

/**
 * The serialisable projection of a controller: which factors it consults, in
 * order, with any parameters they were composed with. The pipeline summary
 * carries it so a dump says which controller decided.
 */
export interface ControllerSummary {
  id: string;
  steps: { factor: string; params?: ControllerParams }[];
}

/** The serialisable projection of a pipeline: what `GET /pipelines` returns and the dump stores. */
export interface PipelineSummary {
  id: string;
  version: string;
  description: string;
  task: {
    criterionKinds: Record<string, string>;
    findingTypes: Record<string, string>;
    maxCriteria: number;
  };
  producer: { consumes: string[] };
  validators: { id: string; gate: string }[];
  critics: {
    id: string;
    samples: number;
    maxItems: number;
    maxTokens: number;
    consumes: string[];
  }[];
  evaluators: {
    id: string;
    samples: number;
    maxItems: number;
    maxTokens: number;
    criterionKinds: string[];
    consumes: string[];
  }[];
  controller: ControllerSummary;
  policy: DecisionPolicy;
}

export type ListPipelinesResponse = ApiResponse<PipelineSummary[]>;
