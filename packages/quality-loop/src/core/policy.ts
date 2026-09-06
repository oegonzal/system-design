/**
 * The decision policy: every number, threshold, gate and route the controller
 * uses. A pipeline declares one as data; `validatePolicy` refuses a malformed
 * one before it can grade anything.
 */
import { AXIS_FACTOR_LEVELS, SEVERITIES } from './contracts';
import type { AxisFactorLevel, Severity, TaskSpec } from './contracts';

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

const inUnit = (value: number): boolean => value >= 0 && value <= 1;

const sameKeys = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((key, index) => key === [...b].sort()[index]);

/** Throws on the first violation, naming the pipeline. A bad rubric must never grade anyone. */
export function validatePolicy(
  policy: DecisionPolicy,
  task: TaskSpec<unknown>,
  pipeline: string,
): void {
  const fail = (message: string): never => {
    throw new Error(`pipeline ${pipeline}: ${message}`);
  };

  const dimensions = Object.keys(policy.dimensionWeights);
  if (dimensions.length === 0) fail('policy declares no dimensions');
  const weightSum = dimensions.reduce((sum, key) => sum + policy.dimensionWeights[key], 0);
  if (Math.abs(weightSum - 1) > 1e-9) fail(`dimension weights sum to ${weightSum}, not 1`);
  if (dimensions.some((key) => policy.dimensionWeights[key] < 0))
    fail('a dimension weight is negative');

  const kinds = Object.keys(task.criterionKinds);
  if (kinds.length === 0) fail('task declares no criterion kinds');
  if (!sameKeys(kinds, Object.keys(policy.criterionKinds))) {
    fail('policy.criterionKinds must price exactly the task criterion kinds');
  }
  for (const kind of kinds) {
    const priced = policy.criterionKinds[kind];
    if (!dimensions.includes(priced.dimension))
      fail(`kind ${kind} lands on unknown dimension ${priced.dimension}`);
    if (!(priced.weight > 0)) fail(`kind ${kind} must weigh more than 0`);
  }

  const types = Object.keys(task.findingTypes);
  if (types.length === 0) fail('task declares no finding types');
  if (!sameKeys(types, Object.keys(policy.findingTypes))) {
    fail('policy.findingTypes must map exactly the task finding types');
  }
  for (const type of types) {
    const mapped = policy.findingTypes[type];
    if (!dimensions.includes(mapped.dimension))
      fail(`finding type ${type} lands on unknown dimension ${mapped.dimension}`);
  }

  const { pass, partial, fail: failValue } = policy.resultValues;
  if (![pass, partial, failValue].every(inUnit) || pass < partial || partial < failValue) {
    fail('resultValues must be in [0,1] with pass ≥ partial ≥ fail');
  }
  const weights = AXIS_FACTOR_LEVELS.map((level) => policy.confidenceWeights[level]);
  if (
    !weights.every(inUnit) ||
    weights.some((weight, index) => index > 0 && weight < weights[index - 1])
  ) {
    fail('confidenceWeights must be in [0,1] and non-decreasing over none → high');
  }
  for (const severity of SEVERITIES) {
    if (!(policy.penalties.bySeverity[severity] >= 0)) fail(`penalty for ${severity} must be ≥ 0`);
  }
  if (!(policy.penalties.decay > 0 && policy.penalties.decay <= 1))
    fail('penalties.decay must be in (0,1]');
  if (!(policy.penalties.maxPerDimension >= 0)) fail('penalties.maxPerDimension must be ≥ 0');
  if (policy.blockingSeverities.some((severity) => !SEVERITIES.includes(severity))) {
    fail('blockingSeverities names an unknown severity');
  }
  if (!(policy.evidence.minHits >= 1)) fail('evidence.minHits must be ≥ 1');
  if (!inUnit(policy.evidence.minAssessedShare)) fail('evidence.minAssessedShare must be in [0,1]');
  const { acceptAt, rejectBelow } = policy.thresholds;
  if (!(rejectBelow >= 0 && rejectBelow < acceptAt && acceptAt <= 100)) {
    fail('thresholds must satisfy 0 ≤ rejectBelow < acceptAt ≤ 100');
  }
  const { maxIterations, plateauAfter, concurrency } = policy.loop;
  if (!(maxIterations >= 1 && plateauAfter >= 1 && concurrency >= 1)) {
    fail('loop.maxIterations, plateauAfter and concurrency must be ≥ 1');
  }
}
