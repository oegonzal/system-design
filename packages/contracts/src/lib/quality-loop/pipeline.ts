import type { ApiResponse } from '../envelope';
import type { AxisFactorLevel, Corroboration, GoalSource, Severity } from './vocab';

/**
 * What a confirmed finding does to the items it names when a reader draws on
 * a run's best iteration — a digest's memories, a recall's kept chunks.
 * `every-ref`: each item it names is withheld. `none`: it names an item
 * without faulting it, and withholds nothing. `every-ref-when-requires-user`:
 * each item it names is withheld when the finding is marked `requires_user` —
 * its judge says only the user can supply what the evidence does not — and
 * nothing otherwise; it reads the fixability a confirmed finding carries, so
 * a validator's problem, which has none, may not declare it.
 *
 * Declared by what storing the item as written would put in the store, never
 * by the type's name: if the item would be false or misleading there — a
 * wrong fact, a wrong attribution, a wrong kind or index key, a restatement
 * of what is already held — the finding withholds it (`every-ref`); if the
 * item is only weaker than it could be — vague, templated, wordy, or beside a
 * gap the finding names — it survives (`none`), because its remedy is a
 * rewrite, not removal. A type that declares nothing withholds every ref on
 * purpose: one whose author has not answered the question is safer withheld
 * than stored.
 *
 * A duplicate type withholds nothing (`none`). A confirmed duplicate finding
 * is not one claim: the normaliser merges samples that share a location
 * (`sameDefect` in `core/evidence/identity.ts`, by design — identity by the
 * exact ref set was measured to discard about 60% of findings), so its refs
 * are a connected component of overlapping claims — [a, b] and [c, a] confirm
 * as {a, b, c}. "All but one" of that set has no principled survivor, and any
 * member may be a bystander to every pair that was actually claimed. The
 * asymmetry decides it: a dropped bystander is lost for good, because a run is
 * not re-digested, while a stored twin costs one bounded, recoverable slot —
 * at recall the next-best still enters the fused top N; a curated pack is not
 * refilled; twins from different runs never meet in one finding anyway. A
 * rule that kept one member of a named set would need findings that name
 * exactly one duplicate set, which the normaliser does not produce.
 */
export const WITHHOLDINGS = ['every-ref', 'every-ref-when-requires-user', 'none'] as const;
export type Withholding = (typeof WITHHOLDINGS)[number];

/**
 * What named a withheld item: a confirmed finding, a validator's problem, or
 * the goal's own index — a fact its composer declared that no item can be
 * stored against, as a reader holds every item to it.
 */
export const WITHHOLDING_SOURCES = ['finding', 'validator', 'index'] as const;
export type WithholdingSource = (typeof WITHHOLDING_SOURCES)[number];

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
         * could be → none (its remedy is a rewrite); a confirmed duplicate set → none
         * (`WITHHOLDINGS` says why).
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
    /**
     * Multiplier on the charge of a CONTRADICTED finding — one that cites
     * criteria and whose every cited criterion the evaluator judged pass or
     * not applicable — under `evidence.corroboration: 'cited'`. In [0, 1];
     * 1 (the default) prices it like any other, as every pipeline before the
     * field did. Two judges disagreeing on one fact is not a fact a plan
     * should be charged the full price for.
     */
    contradicted?: number;
  };
  blockingSeverities: readonly Severity[];
  evidence: {
    /**
     * Samples an item must recur in to count — and to block. A lens that lost
     * a sample is held to the samples it has left: what they agree on is
     * confirmed with the hits it has, so it scores, and blocks nothing.
     */
    minHits: number;
    /** Share of criteria that must be assessed before a score means anything. */
    minAssessedShare: number;
    /** What a blocker needs beyond agreement (`CORROBORATIONS`); `none` when undeclared. */
    corroboration?: Corroboration;
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
  /**
   * How the producer is briefed on a revise or retry. Absent, every selected
   * remediation of the best is handed, as every pipeline before the field.
   * With `remediationsPerRound`, the worst of them up to that many — every
   * validator note first, then the rest in the controller's worst-first
   * order (`briefedRemediations`); the decision, the trace and every reader
   * keep the whole list, and the prompt's heading says how many were kept
   * back. Measured 2026-11-07, canvas coach chain 4: handed 30–35 at once,
   * the coach rewrote 22–31 of 34 bindings a round and the score ran
   * 67.7 → 72.2 → 68.5 → 65.
   */
  briefing?: { remediationsPerRound: number };
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
    /** The longest statement a supplied rubric may carry: the longest its deriver can return — keptAtMost of the statement bound. */
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
    /** The finding types this lens may emit; absent, every one the task declares. */
    findingTypes?: string[];
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
