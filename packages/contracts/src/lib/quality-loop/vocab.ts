/**
 * The quality loop's closed vocabularies. `as const` tuples are the single
 * source of each: the loop's zod builders enum-lock the model to them, the
 * policy prices them, the trace records them and the web client maps them to
 * tones.
 */

/** How bad a defect is. `critical` alone can block a decision; `info` is never priced. */
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Ordinal levels — what the evidence implies, not a false-precision number. */
export const AXIS_FACTOR_LEVELS = ['none', 'low', 'medium', 'high'] as const;
export type AxisFactorLevel = (typeof AXIS_FACTOR_LEVELS)[number];

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

/**
 * What a lens may declare it consumes from the wave before it: the findings
 * the normaliser confirmed, or the criterion results it settled. Never a raw
 * report — the deterministic normaliser is the boundary between tiers.
 */
export const UPSTREAM_EVIDENCE = ['findings', 'results'] as const;
export type UpstreamEvidence = (typeof UPSTREAM_EVIDENCE)[number];

/** What the producer is briefed with beyond the goal. Empty means the goal alone. */
export const PRODUCER_BRIEFING = ['criteria'] as const;
export type ProducerBriefing = (typeof PRODUCER_BRIEFING)[number];

/** `block` stops the iteration before any model call; `warn` only informs. */
export const VALIDATOR_GATES = ['block', 'warn'] as const;
export type ValidatorGate = (typeof VALIDATOR_GATES)[number];
