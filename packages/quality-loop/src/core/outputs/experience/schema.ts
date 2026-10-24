/**
 * A finished run's record as a shape: the caps that keep a maximal record well
 * under the engine's goal budget, and the facts every digest of a run reads —
 * iterations, criteria, findings and what was left out.
 */
import {
  AXIS_FACTOR_LEVELS,
  bound,
  bounded,
  CRITERION_ID_MAX_LENGTH,
  CRITERION_KIND_MAX_LENGTH,
  CRITERION_RESULTS,
  DECISIONS,
  exact,
  FIXABILITIES,
  ITERATION_MODES,
  MAX_QUALITY_RUN_ITERATIONS,
  SEVERITIES,
  STOP_REASONS,
  TRANSITION_KINDS,
} from '@sysdesign/contracts';
import { z } from 'zod';

/** Caps chosen so a maximal record renders well under the engine's goal budget. */
export const MAX_FINDINGS = 32;
export const MAX_CRITERIA_ITEMS = 24;
export const MAX_EVIDENCE = MAX_FINDINGS + MAX_CRITERIA_ITEMS;
export const PROMPT_MAX = 12_000;
export const ARTIFACT_MAX = 16_000;
export const RATIONALE_MAX = 200;
export const REASON_MAX = 200;
export const STATEMENT_MAX = 300;
/** An evidence alias — `f12`, `r3` — and the engine ids a finding carries. */
export const ALIAS_MAX = 8;
export const REF_MAX = 40;
export const LENS_MAX = 40;
export const TRANSITION_DETAIL_MAX = 120;
/** How many locations, criteria and lenses one recorded finding lists. */
export const MAX_FINDING_REFS = 8;
export const MAX_FINDING_CRITERIA = 4;
export const MAX_FINDING_LENSES = 6;

const FINDING_TYPE_MAX = 60;
const DIMENSION_MAX = 40;
const RUN_ID_MAX = 80;
const PIPELINE_ID_MAX = 120;

/*
 * The record is composed (`experienceOf`), never written by a model: each text
 * is capped where it is composed at its bound's target, and each list sliced
 * to its count, so the counts are exact and the prose is bounded — a record
 * another composer hands over a little past a target is still a record.
 */
const PROMPT_BOUND = bound(PROMPT_MAX);
const ARTIFACT_BOUND = bound(ARTIFACT_MAX);
const RATIONALE_BOUND = bound(RATIONALE_MAX);
const REASON_BOUND = bound(REASON_MAX);
const STATEMENT_BOUND = bound(STATEMENT_MAX);
const TRANSITION_DETAIL_BOUND = bound(TRANSITION_DETAIL_MAX);
const PER_ITERATION_BOUND = exact(MAX_QUALITY_RUN_ITERATIONS);
const TRANSITION_ENDS_BOUND = exact(2);
const FINDINGS_BOUND = exact(MAX_FINDINGS);
const CRITERIA_BOUND = exact(MAX_CRITERIA_ITEMS);
const FINDING_REFS_BOUND = exact(MAX_FINDING_REFS);
const FINDING_CRITERIA_BOUND = exact(MAX_FINDING_CRITERIA);
const FINDING_LENSES_BOUND = exact(MAX_FINDING_LENSES);

/** What a run's record offers an item to rest on: its confirmed findings and its judged criteria. */
export const RECORD_EVIDENCE_KINDS = ['finding', 'criterion'] as const;

const alias = bounded.id(ALIAS_MAX, { min: 1 });
const iteration = z.number().int().min(1);
const score = z.number().nullable();
const dimension = bounded.id(DIMENSION_MAX);

export const transitionSchema = z.strictObject({
  kind: z.enum(TRANSITION_KINDS),
  iterations: bounded.list(TRANSITION_ENDS_BOUND, iteration, { min: 2 }),
  detail: bounded.text(TRANSITION_DETAIL_BOUND),
});
export type Transition = z.infer<typeof transitionSchema>;

export const iterationSummarySchema = z.strictObject({
  iteration,
  mode: z.enum(ITERATION_MODES),
  decision: z.enum(DECISIONS),
  reason: bounded.text(REASON_BOUND),
  overall: z.number(),
  overallDelta: score,
  dimensions: z.record(dimension, score),
  dimensionDeltas: z.record(dimension, score),
});
export type IterationSummary = z.infer<typeof iterationSummarySchema>;

export const recordedCriterionSchema = z.strictObject({
  alias,
  id: bounded.id(CRITERION_ID_MAX_LENGTH, { min: 1 }),
  kind: bounded.id(CRITERION_KIND_MAX_LENGTH, { min: 1 }),
  statement: bounded.text(STATEMENT_BOUND, { min: 1 }),
  results: bounded.list(
    PER_ITERATION_BOUND,
    z.strictObject({ iteration, result: z.enum([...CRITERION_RESULTS, 'unassessed'] as const) }),
  ),
  transitions: bounded.list(PER_ITERATION_BOUND, transitionSchema),
});
export type RecordedCriterion = z.infer<typeof recordedCriterionSchema>;

export const recordedFindingSchema = z.strictObject({
  alias,
  /**
   * The engine's own identity for the finding (`findingKey`): its type and
   * every ref it was ever located at, so as long as those make it — a finding
   * merged across samples has measurably run past 200 characters. The
   * goal budget, not a field cap, bounds what of it renders.
   */
  key: z.string().min(1),
  type: bounded.id(FINDING_TYPE_MAX, { min: 1 }),
  severity: z.enum(SEVERITIES),
  confidence: z.enum(AXIS_FACTOR_LEVELS),
  fixability: z.enum(FIXABILITIES),
  locationRefs: bounded.list(FINDING_REFS_BOUND, bounded.id(REF_MAX)),
  /** Aliases of the record's criteria the finding weakened. */
  criteria: bounded.list(FINDING_CRITERIA_BOUND, alias),
  lenses: bounded.list(FINDING_LENSES_BOUND, bounded.id(LENS_MAX)),
  iterations: bounded.list(PER_ITERATION_BOUND, iteration, { min: 1 }),
  rationale: bounded.text(RATIONALE_BOUND).nullable(),
  /** The policy selected it for remediation in at least one iteration. */
  remediated: z.boolean(),
  reconciledTo: alias.nullable(),
  transitions: bounded.list(PER_ITERATION_BOUND, transitionSchema),
  /**
   * Seen only in an iteration adopted from an earlier run: that run's judges
   * confirmed it, and only its transitions are this run's own.
   */
  adopted: z.boolean(),
});
export type RecordedFinding = z.infer<typeof recordedFindingSchema>;

/**
 * What the record left out, counted: findings and criteria past their caps or
 * the goal budget, and findings seen only in an adopted iteration with no
 * transition — copies of an earlier run's evidence this run changed nothing
 * about, which that run's own digest already read. A codec that leaves out
 * more extends it.
 */
export const omittedShape = z.strictObject({
  findings: z.number().int().min(0),
  criteria: z.number().int().min(0),
  adopted: z.number().int().min(0),
});

/**
 * The facts themselves. A codec extends this with what its own stages read —
 * the rules that travel with the record, how many items it may propose, and
 * anything else it hands the model.
 */
export const experienceShape = z.strictObject({
  runId: bounded.id(RUN_ID_MAX, { min: 1 }),
  pipeline: bounded.id(PIPELINE_ID_MAX, { min: 1 }),
  finalDecision: z.enum(DECISIONS),
  stopReason: z.enum(STOP_REASONS),
  bestIteration: iteration,
  prompt: bounded.text(PROMPT_BOUND, { min: 1 }),
  artifact: bounded.text(ARTIFACT_BOUND).nullable(),
  iterations: bounded.list(PER_ITERATION_BOUND, iterationSummarySchema, { min: 1 }),
  criteria: bounded.list(CRITERIA_BOUND, recordedCriterionSchema),
  findings: bounded.list(FINDINGS_BOUND, recordedFindingSchema),
  omitted: omittedShape,
});
export type Experience = z.infer<typeof experienceShape>;
