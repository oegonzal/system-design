/**
 * The loop's closed vocabularies. `as const` tuples are the single source of
 * each: the zod builders in `../schemas.ts` enum-lock the model to them, the
 * policy prices them, and the trace records them. Ordinal levels and
 * severities are the repo's own (`@sysdesign/contracts`), so evidence from this
 * package speaks the same currency as the studio's grader.
 */
export { AXIS_FACTOR_LEVELS, SEVERITIES } from '@sysdesign/contracts';
export type { AxisFactorLevel, Severity } from '@sysdesign/contracts';

/** The controller's verdict on an artifact — the doctrine's ControllerDecision. */
export const DECISIONS = ['accept', 'revise', 'retry', 'escalate', 'reject'] as const;
export type Decision = (typeof DECISIONS)[number];

/** An evaluator's judgement of one criterion. */
export const CRITERION_RESULTS = ['pass', 'partial', 'fail', 'not_applicable'] as const;
export type CriterionResult = (typeof CRITERION_RESULTS)[number];

/** Most to least locally fixable; the one routing input a critic supplies. */
export const FIXABILITIES = [
  'fixable_local',
  'requires_retry',
  'requires_user',
  'unfixable',
] as const;
export type Fixability = (typeof FIXABILITIES)[number];

/** Why a stage produced nothing — the eval worker's reasons, verbatim. */
export const DIAGNOSTIC_REASONS = [
  'llm-disabled',
  'llm-failed',
  'token-clipped',
  'llm-artifact-rejected',
  'not-applicable',
] as const;
export type DiagnosticReason = (typeof DIAGNOSTIC_REASONS)[number];

/** Why the loop ended — the runner's reason, distinct from the last decision. */
export const STOP_REASONS = [
  'accepted',
  'rejected',
  'escalated',
  'plateau',
  'max-iterations',
  'producer-unavailable',
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export const PRODUCE_MODES = ['initial', 'revise', 'retry'] as const;
export type ProduceMode = (typeof PRODUCE_MODES)[number];

/** `block` stops the iteration before any model call; `warn` only informs. */
export const VALIDATOR_GATES = ['block', 'warn'] as const;
export type ValidatorGate = (typeof VALIDATOR_GATES)[number];
