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

/**
 * Why a stage produced nothing, or what it noted about what it did produce.
 * A model that answers nothing is `llm-failed`; there is no "off". `overrun`
 * is a field a reply wrote past the size it was asked for — kept, and
 * recorded once per field, never a loss.
 */
export const DIAGNOSTIC_REASONS = [
  'llm-failed',
  'token-clipped',
  'llm-artifact-rejected',
  'not-applicable',
  'overrun',
] as const;
export type DiagnosticReason = (typeof DIAGNOSTIC_REASONS)[number];

/**
 * Whether a reason means a stage that should have answered did not — what it
 * fed was then computed without it. `not-applicable` is a stage with nothing
 * to do, a lens with no criteria of its kinds, and costs a grade nothing; an
 * `overrun` is a stage that answered whole. Exhaustive, so a new reason is
 * classified where it is declared.
 */
export const DIAGNOSTIC_DEGRADES = {
  'llm-failed': true,
  'token-clipped': true,
  'llm-artifact-rejected': true,
  'not-applicable': false,
  overrun: false,
} as const satisfies Record<DiagnosticReason, boolean>;

/**
 * What a lens's lost sample does to agreement. `score-only`: what the samples
 * that answered agree on is confirmed with the hits it has — it scores, but
 * fewer than `minHits` samples saw it, so it cannot block. `discard`: the
 * policy's `minHits` stands, so one lost sample can silence its lens.
 */
export const LOST_SAMPLE_POLICIES = ['score-only', 'discard'] as const;
export type LostSamplePolicy = (typeof LOST_SAMPLE_POLICIES)[number];

/** Why the loop ended — the runner's reason, distinct from the last decision. */
export const STOP_REASONS = [
  'accepted',
  'rejected',
  'escalated',
  'plateau',
  'max-iterations',
  'produce-lost',
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

/**
 * What ended the loop, reason by reason. `decision`: the controller's last
 * decision did — accept, reject, escalate — and the decision beside the stop
 * already says so. `budget`: the loop ran out of iterations, or of progress,
 * with a design it could still have revised — or ended on a produce that
 * answered nothing (`produce-lost`), with no produce call left to lose or no
 * iteration left to ask again in. Exhaustive, so a new reason is classified
 * where it is declared; `gradeStopReason` reads it.
 */
export const STOP_REASON_CAUSES = {
  accepted: 'decision',
  rejected: 'decision',
  escalated: 'decision',
  plateau: 'budget',
  'max-iterations': 'budget',
  'produce-lost': 'budget',
} as const satisfies Record<StopReason, 'decision' | 'budget'>;

export const PRODUCE_MODES = ['initial', 'revise', 'retry'] as const;
export type ProduceMode = (typeof PRODUCE_MODES)[number];

/**
 * How an iteration came by its artifact: produced by the loop in one of the
 * modes above, `provided` by the caller and judged as handed in, or `adopted`
 * — a recorded iteration of an earlier run copied verbatim, no model called.
 */
export const ITERATION_MODES = [...PRODUCE_MODES, 'provided', 'adopted'] as const;
export type IterationMode = (typeof ITERATION_MODES)[number];

/**
 * What kind of goal a pipeline takes. `brief`: a goal a person typed — a
 * route for the router and a target for an orchestrator. `composed`: a goal
 * another program composed (a memory step, the studio) — never offered as a
 * route, accepted as a target, or listed for a person to pick.
 */
export const GOAL_SOURCES = ['brief', 'composed'] as const;
export type GoalSource = (typeof GOAL_SOURCES)[number];

/**
 * What a lens may declare it consumes from the wave before it: the findings
 * the normaliser confirmed, or the criterion results it settled. Never a raw
 * report — the deterministic normaliser is the boundary between tiers.
 */
export const UPSTREAM_EVIDENCE = ['findings', 'results'] as const;
export type UpstreamEvidence = (typeof UPSTREAM_EVIDENCE)[number];

/**
 * What the producer is briefed with beyond the goal. Empty means the goal
 * alone. `criteria`: the rubric the run is judged against. `memories`:
 * advisory lessons the run was handed before it started — shown to the
 * producer under their own heading, never to the deriver, a critic or an
 * evaluator, so they can inform an artifact and never a grade. `setbacks`:
 * when the attempt just before was judged and did not beat the best, the
 * defects its judges confirmed — the producer revises the best with the
 * best's remediations, so nothing else would tell it what its last attempt
 * got wrong, and it would write the same thing again.
 */
export const PRODUCER_BRIEFING = ['criteria', 'memories', 'setbacks'] as const;
export type ProducerBriefing = (typeof PRODUCER_BRIEFING)[number];

/**
 * What a validator's problems do. `block` stops the iteration before any
 * model call: the artifact cannot be trusted by any lens. `cut` refuses the
 * positions its problems point at and nothing before them, and the lenses
 * still judge the whole artifact — for a positional artifact, an exact fault
 * at one unit says nothing against the units ahead of it, and a caller that
 * executes units in order runs up to the fault. `warn` only informs.
 */
export const VALIDATOR_GATES = ['block', 'cut', 'warn'] as const;
export type ValidatorGate = (typeof VALIDATOR_GATES)[number];

/** The gates whose problems refuse something — what the controller's validators gate counts. */
export const REFUSING_GATES = ['block', 'cut'] as const satisfies readonly ValidatorGate[];

/**
 * What a confirmed finding needs, beyond agreement, before it may block.
 * `none`: agreement alone — a confirmed finding of a gating type or a blocking
 * severity closes the gate. `cited`: a blocker is held to the criteria it
 * cites — it blocks only when the evaluator failed a gating criterion it
 * cites, and is priced like any other finding otherwise; one that cites none
 * made no checkable claim and is priced, never a veto. Two judges reading the
 * same fact apart is the agreement a one-sample lens cannot supply for itself.
 */
export const CORROBORATIONS = ['none', 'cited'] as const;
export type Corroboration = (typeof CORROBORATIONS)[number];
