/**
 * `validatePolicy` refuses a malformed decision policy (the shape lives in
 * `@sysdesign/contracts`) before it can grade anything.
 */
import { AXIS_FACTOR_LEVELS, CORROBORATIONS, SEVERITIES, WITHHOLDINGS } from '@sysdesign/contracts';
import type { DecisionPolicy } from '@sysdesign/contracts';

import { sum } from './arithmetic';
import type { TaskSpec } from './contracts';

/** How far from exactly 1 the dimension weights may sum, allowing for the decimals they are written in. */
const WEIGHT_TOLERANCE = 1e-9;

/**
 * How every pipeline so far prices evidence into a score: a partial result
 * earns half, confidence scales a finding's charge, severities cost what they
 * cost with the second finding on a dimension charged at 0.7 of the first,
 * and only a critical finding blocks on its own. A pipeline spreads this and
 * writes over what it prices differently.
 */
export const STANDARD_SCORING: Pick<
  DecisionPolicy,
  'resultValues' | 'confidenceWeights' | 'penalties' | 'blockingSeverities'
> = {
  resultValues: { pass: 1, partial: 0.5, fail: 0 },
  confidenceWeights: { none: 0, low: 0.33, medium: 0.67, high: 1 },
  penalties: {
    bySeverity: { critical: 40, high: 25, medium: 12, low: 5, info: 0 },
    decay: 0.7,
    maxPerDimension: 60,
  },
  blockingSeverities: ['critical'],
};

type Fail = (message: string) => never;

const inUnit = (value: number): boolean => value >= 0 && value <= 1;

const sameKeys = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((key, index) => key === [...b].sort()[index]);

/** At least one dimension, weights that sum to 1 and none negative. */
function checkDimensions(policy: DecisionPolicy, fail: Fail): string[] {
  const dimensions = Object.keys(policy.dimensionWeights);
  if (dimensions.length === 0) fail('policy declares no dimensions');
  const weightSum = sum(dimensions.map((key) => policy.dimensionWeights[key]));
  if (Math.abs(weightSum - 1) > WEIGHT_TOLERANCE)
    fail(`dimension weights sum to ${weightSum}, not 1`);
  if (dimensions.some((key) => policy.dimensionWeights[key] < 0))
    fail('a dimension weight is negative');
  return dimensions;
}

/** The policy prices exactly the task's kinds, each onto a declared dimension with a positive weight. */
function checkCriterionKinds(
  policy: DecisionPolicy,
  task: TaskSpec<unknown>,
  dimensions: readonly string[],
  fail: Fail,
): void {
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
}

/**
 * The policy maps exactly the task's finding types, each onto a declared
 * dimension, and what one withholds — when it says — is a declared withholding.
 */
function checkFindingTypes(
  policy: DecisionPolicy,
  task: TaskSpec<unknown>,
  dimensions: readonly string[],
  fail: Fail,
): void {
  const types = Object.keys(task.findingTypes);
  if (types.length === 0) fail('task declares no finding types');
  if (!sameKeys(types, Object.keys(policy.findingTypes))) {
    fail('policy.findingTypes must map exactly the task finding types');
  }
  for (const type of types) {
    const mapped = policy.findingTypes[type];
    if (!dimensions.includes(mapped.dimension))
      fail(`finding type ${type} lands on unknown dimension ${mapped.dimension}`);
    if (
      mapped.withholds !== undefined &&
      !(WITHHOLDINGS as readonly string[]).includes(mapped.withholds)
    ) {
      fail(
        `finding type ${type} withholds ${mapped.withholds}, not one of ${WITHHOLDINGS.join(', ')}`,
      );
    }
  }
}

/** Result values and confidence weights on the unit scale and ordered; penalties non-negative and decaying. */
function checkPricing(policy: DecisionPolicy, fail: Fail): void {
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
  const { contradicted } = policy.penalties;
  if (contradicted !== undefined && !inUnit(contradicted)) {
    fail('penalties.contradicted must be in [0,1]');
  }
  // A finding is contradicted only where the policy holds findings to the
  // criteria they cite; under any other corroboration no finding ever is, and
  // the discount would be a number nothing reads.
  if (contradicted !== undefined && policy.evidence.corroboration !== 'cited') {
    fail(
      "penalties.contradicted prices a contradicted finding, which only evidence.corroboration 'cited' names",
    );
  }
  if (policy.blockingSeverities.some((severity) => !SEVERITIES.includes(severity))) {
    fail('blockingSeverities names an unknown severity');
  }
}

/** Agreement, thresholds and the loop's limits, each within its range. */
function checkLoop(policy: DecisionPolicy, fail: Fail): void {
  if (!(policy.evidence.minHits >= 1)) fail('evidence.minHits must be ≥ 1');
  if (!inUnit(policy.evidence.minAssessedShare)) fail('evidence.minAssessedShare must be in [0,1]');
  const { corroboration } = policy.evidence;
  if (
    corroboration !== undefined &&
    !(CORROBORATIONS as readonly string[]).includes(corroboration)
  ) {
    fail(`evidence.corroboration must be one of ${CORROBORATIONS.join(', ')}`);
  }
  const { acceptAt, rejectBelow } = policy.thresholds;
  if (!(rejectBelow >= 0 && rejectBelow < acceptAt && acceptAt <= 100)) {
    fail('thresholds must satisfy 0 ≤ rejectBelow < acceptAt ≤ 100');
  }
  const { maxIterations, plateauAfter, concurrency, lostProduces } = policy.loop;
  if (!(maxIterations >= 1 && plateauAfter >= 1 && concurrency >= 1)) {
    fail('loop.maxIterations, plateauAfter and concurrency must be ≥ 1');
  }
  if (!(Number.isInteger(lostProduces) && lostProduces >= 0)) {
    fail('loop.lostProduces must be a whole number ≥ 0');
  }
}

/** Throws on the first violation, naming the pipeline. A bad rubric must never grade anyone. */
export function validatePolicy(
  policy: DecisionPolicy,
  task: TaskSpec<unknown>,
  pipeline: string,
): void {
  const fail: Fail = (message) => {
    throw new Error(`pipeline ${pipeline}: ${message}`);
  };
  const dimensions = checkDimensions(policy, fail);
  checkCriterionKinds(policy, task, dimensions, fail);
  checkFindingTypes(policy, task, dimensions, fail);
  checkPricing(policy, fail);
  checkLoop(policy, fail);
}
