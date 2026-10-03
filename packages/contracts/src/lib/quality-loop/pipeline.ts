import type { ApiResponse } from '../envelope';
import type { AxisFactorLevel, GoalSource, LostSamplePolicy, Severity } from './vocab';

/**
 * What a confirmed finding does to the items it names when a reader draws on
 * a run's best iteration — a digest's memories, a recall's kept chunks.
 * `every-ref`: each item it names is withheld. `all-but-one`: all but the one
 * with the most support — passing criteria that cite it — are, ties to the
 * first in the artifact; a duplicate keeps its best copy. `none`: it names an
 * item without faulting it, and withholds nothing.
 *
 * Declared by what storing the item as written would put in the store, never
 * by the type's name: if the item would be false or misleading there — a
 * wrong fact, a wrong attribution, a wrong kind or index key, a restatement
 * of what is already held — the finding withholds it (`every-ref`); if the
 * item is only weaker than it could be — vague, templated, wordy, or beside a
 * gap the finding names — it survives (`none`), because its remedy is a
 * rewrite, not removal; a duplicate withholds all but the best-supported of
 * its group (`all-but-one`). A type that declares nothing withholds every ref
 * on purpose: one whose author has not answered the question is safer
 * withheld than stored.
 */
export const WITHHOLDINGS = ['every-ref', 'all-but-one', 'none'] as const;
export type Withholding = (typeof WITHHOLDINGS)[number];

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
  /**
   * Every task finding type: where its penalty lands, whether it is an
   * unacceptable failure mode, and what it withholds of the items it names
   * from a reader of the run (`WITHHOLDINGS`; `every-ref` when undeclared).
   */
  findingTypes: Readonly<
    Record<
      string,
      {
        dimension: string;
        gate: boolean;
        /**
         * Declared by what storing the item as written would put in the store, never
         * by the type's name: false or misleading → every-ref; only weaker than it
         * could be → none (its remedy is a rewrite); a duplicate → all-but-one.
         */
        withholds?: Withholding;
      }
    >
  >;
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
    /** Samples an item must recur in to count — and to block. */
    minHits: number;
    /** Share of criteria that must be assessed before a score means anything. */
    minAssessedShare: number;
    /** What a lens sample that answered nothing does to agreement (`LOST_SAMPLE_POLICIES`). */
    lostSample: LostSamplePolicy;
  };
  thresholds: { acceptAt: number; rejectBelow: number };
  loop: {
    maxIterations: number;
    plateauAfter: number;
    concurrency: number;
    /**
     * Produce calls a run may lose — answered with nothing — and go on. Each
     * spends its iteration and is asked again in the same mode from the
     * best; one more, or one on the last iteration, ends the run
     * `produce-lost`.
     */
    lostProduces: number;
  };
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
  /** What kind of goal the pipeline takes; a composed one is never a route, a target, or a choice. */
  goalSource: GoalSource;
  task: {
    criterionKinds: Record<string, string>;
    findingTypes: Record<string, string>;
    maxCriteria: number;
    /** The longest statement a derivation is accepted with, and a supplied rubric may carry — the statement bound's ceiling. */
    maxStatementLength: number;
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
